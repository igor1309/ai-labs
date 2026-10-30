@testable import CallText
@testable import Compose
import AppKit
import LiveText
import PanelUI
import class SwiftUI.NSHostingView
import Synchronization
import Testing

@Suite(.timeLimit(.minutes(1)))
struct ProfilingTests {

    @MainActor @Test func panelIntervalEnclosesTranscriptReplacementAndLayout() throws {

        let profiling = ProfileIntervalSpy()
        let host = PanelLayoutProbe(rootView: PanelView(state: .init(recording: .off, log: .empty), event: { _ in }))
        let window = NSWindow(contentRect: .init(x: 0, y: 0, width: 360, height: 640),
                              styleMask: .borderless, backing: .buffered, defer: false)
        window.contentView = host
        defer {
            host.didLayout = {}
            window.contentView = nil
        }
        host.layoutSubtreeIfNeeded()
        let laidOut = Values<String>()
        host.didLayout = {
            #expect(profiling.active("PanelUpdate") == 1)
            if let text = panelText(in: host) {
                #expect(text.frame.width > 0)
                #expect(text.textLayoutManager?.usageBoundsForTextContainer.height ?? 0 > 0)
                laidOut.append(text.string)
            }
        }
        let boundaries = Values<String>()
        let inspect: @MainActor @Sendable (String) -> Void = { prefix in
            boundaries.append(prefix + (panelText(in: host)?.string ?? ""))
        }
        let intervals = ProfileIntervals { name in
            let end = profiling.intervals.begin(name)
            MainActor.assumeIsolated { inspect("begin: ") }
            return {
                MainActor.assumeIsolated { inspect("end: ") }
                end()
            }
        }
        let presented = Values<PanelState>()
        let update = SignpostedPanelUpdate(host: host, content: {
            #expect(profiling.active("PanelUpdate") == 1)
            presented.append($0)
            return PanelView(state: $0, event: { _ in })
        }, intervals: intervals)
        for (index, words) in ["first transcript", String(repeating: "updated transcript ", count: 40)].enumerated() {
            let before = panelText(in: host)?.string ?? ""
            let layoutsBefore = laidOut.all.count
            let state = PanelState(recording: .on(elapsed: "00:01"), log: .lines(.init(entries: [
                .init(id: 1, time: "00:00", speaker: .me, settled: words),
            ])))
            update(state)
            #expect(presented.all.last == state)
            let text = try #require(panelText(in: host))
            #expect(text.string.contains(words))
            #expect(laidOut.all.count > layoutsBefore)
            #expect(laidOut.all.last == text.string)
            #expect(Array(boundaries.all.suffix(2)) == ["begin: " + before, "end: " + text.string])
            #expect(profiling.began.all == Array(repeating: "PanelUpdate", count: index + 1))
            #expect(profiling.ended.all == profiling.began.all)
            #expect(profiling.active("PanelUpdate") == 0)
        }
    }

    @Test func decoratorsPreserveArgumentsResultsAndErrorsAndEndEveryInterval() async throws {
        for fails in [false, true] {
            let calls = Values<String>()
            let intervals = ProfileIntervals { name in
                let name = String(describing: name)
                calls.append("begin \(name)")
                return { calls.append("end \(name)") }
            }
            let failure = ProfileFailure()
            let hearing = Hearing(words: [.init("word", start: 0, end: 1)])
            let chunk = AudioChunk(samples: [0.25], sampleRate: 48_000)
            let state = State(status: .listening, entries: [])
            let recognizer = ProfileRecognizer(
                onHear: { value in
                    #expect(value == chunk)
                    calls.append("hear")
                    if fails { throw failure }
                    return hearing
                }, onFinish: { calls.append("finish"); return hearing }
            )
            let file = ProfileFile(onWrite: { value in
                #expect(value == state)
                calls.append("write")
                if fails { throw failure }
            }, onClose: { calls.append("close") })
            let transcript = SignpostedTranscriptFile(base: file, intervals: intervals)
            let decorated = SignpostedRecognizer(base: recognizer, intervals: intervals)
            do {
                try await transcript.write(state)
                #expect(!fails)
            } catch { #expect(error as? ProfileFailure === failure) }
            do {
                let result = try await decorated.hear(chunk)
                #expect(!fails)
                #expect(result == hearing)
            } catch { #expect(error as? ProfileFailure === failure) }
            #expect(try await decorated.finish() == hearing)
            await transcript.close()
            #expect(calls.all == [
                "begin TranscriptWrite", "write", "end TranscriptWrite",
                "begin Hearing", "hear", "end Hearing", "finish", "close",
            ])
        }
    }
}

private final class ProfileFailure: Error {}

private struct ProfileRecognizer: Recognizer {
    let onHear: @Sendable (AudioChunk) async throws -> Hearing
    let onFinish: @Sendable () async throws -> Hearing
    func hear(_ chunk: AudioChunk) async throws -> Hearing { try await onHear(chunk) }
    func finish() async throws -> Hearing { try await onFinish() }
}

private struct ProfileFile: SessionTranscriptFile {
    let onWrite: @Sendable (State) async throws -> Void
    let onClose: @Sendable () async -> Void
    func write(_ state: State) async throws { try await onWrite(state) }
    func close() async { await onClose() }
}

final class ProfileIntervalSpy: Sendable {

    let began = Values<String>()
    let ended = Values<String>()
    private let running = Mutex<[String: Int]>([:])

    var intervals: ProfileIntervals {
        ProfileIntervals { name in
            let name = String(describing: name)
            self.running.withLock { $0[name, default: 0] += 1 }
            self.began.append(name)
            return {
                self.running.withLock { $0[name, default: 0] -= 1 }
                self.ended.append(name)
            }
        }
    }

    func active(_ name: String) -> Int { running.withLock { $0[name, default: 0] } }
}

@MainActor
private final class PanelLayoutProbe: NSHostingView<PanelView> {

    var didLayout: () -> Void = {}

    override func layout() {
        super.layout()
        didLayout()
    }
}

@MainActor
private func panelText(in view: NSView) -> NSTextView? {
    if let text = view as? NSTextView { return text }
    return view.subviews.lazy.compactMap(panelText(in:)).first
}
