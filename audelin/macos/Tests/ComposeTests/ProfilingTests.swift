@testable import CallText
@testable import Compose
import AppKit
import LiveText
import Observation
import PanelUI
import class SwiftUI.NSHostingView
import protocol SwiftUI.View
import Synchronization
import Testing

@Suite(.timeLimit(.minutes(1)))
struct ProfilingTests {

    @MainActor @Test func panelRenderCoalescesStatesAndEnclosesTranscriptLayout() throws {

        let plain = try renderBursts(instrumented: false)
        let profiled = try renderBursts(instrumented: true)
        #expect(profiled.layouts <= plain.layouts)
        #expect(profiled.transcriptLayouts <= plain.transcriptLayouts)
        #expect(profiled.intervals == profiled.layouts)
    }

    @MainActor
    private func renderBursts(instrumented: Bool) throws -> (layouts: Int, transcriptLayouts: Int, intervals: Int) {

        let markers = Values<String>()
        let shown = ObservedPanelState()
        let content = ObservedPanel(
            shown: shown, rendered: { markers.append("render") },
            renderedLayout: { markers.append("host layout") }
        )
        let intervals = ProfileIntervals { name in
            #expect(String(describing: name) == "PanelUpdate")
            markers.append("begin")
            return { markers.append("end") }
        }
        let host: NSHostingView<ObservedPanel> = instrumented
            ? ProfiledPanelLayoutProbe(rootView: content, intervals: intervals)
            : PanelLayoutProbe(rootView: content)
        let window = NSWindow(contentRect: .init(x: 0, y: 0, width: 360, height: 640),
                              styleMask: .borderless, backing: .buffered, defer: false)
        window.contentView = host
        defer { window.contentView = nil }
        host.layoutSubtreeIfNeeded()
        let text = try #require(panelText(in: host))
        let original = try #require(text.textLayoutManager)
        let storage = try #require(original.textContentManager)
        let container = try #require(original.textContainer)
        let manager = TranscriptLayoutProbe(markers: markers)
        text.textContainer = nil
        original.textContainer = nil
        storage.removeTextLayoutManager(original)
        storage.addTextLayoutManager(manager)
        manager.textContainer = container
        text.textContainer = container
        host.layoutSubtreeIfNeeded()

        var layouts = 0, transcriptLayouts = 0, intervalCount = 0
        for words in ["first rendered transcript", String(repeating: "wrapped transcript ", count: 40)] {
            let start = markers.all.count
            let states = ["superseded first", "superseded second", words].map { words in
                PanelState(recording: .on(elapsed: "00:01"), log: .lines(.init(entries: [
                    .init(id: 1, time: "00:00", speaker: .me, settled: words),
                ])))
            }
            // No suspension or layout request between deliveries: SwiftUI sees one burst.
            for state in states { shown.state = state }
            #expect(markers.all.count == start)
            host.layoutSubtreeIfNeeded()

            let pass = Array(markers.all.dropFirst(start))
            #expect(text.string.contains(words))
            #expect(!text.string.contains("superseded"))
            #expect(text.frame.width > 0)
            #expect(manager.usageBoundsForTextContainer.height > 0)
            #expect(pass.filter { $0 == "render" }.count == 1)
            let passes = pass.filter { $0 == "host layout" }.count
            let completed = pass.filter { $0 == "text laid out" }.count
            #expect(passes > 0)
            #expect(completed > 0)
            #expect(pass.filter { $0 == "text layout" }.count == completed)
            layouts += passes
            transcriptLayouts += completed
            if instrumented {
                var active = 0, pendingLayouts = 0
                for marker in pass {
                    switch marker {
                    case "begin":
                        #expect(active == 0)
                        active += 1
                        intervalCount += 1
                    case "end":
                        #expect(active == 1)
                        #expect(pendingLayouts == 0)
                        active -= 1
                    case "text layout":
                        #expect(active == 1)
                        pendingLayouts += 1
                    case "text laid out":
                        #expect(active == 1)
                        #expect(pendingLayouts > 0)
                        pendingLayouts -= 1
                    case "render":
                        #expect(active == 1, "\(marker) must be inside the render interval: \(pass)")
                    default: break
                    }
                }
                #expect(active == 0)
                #expect(pendingLayouts == 0)
                #expect(pass.filter { $0 == "begin" }.count == passes)
                #expect(pass.filter { $0 == "end" }.count == passes)
            }
        }
        #expect(markers.all.filter { $0 == "begin" }.count == markers.all.filter { $0 == "end" }.count)
        return (layouts, transcriptLayouts, intervalCount)
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

@MainActor @Observable
private final class ObservedPanelState {

    var state = PanelState(recording: .off, log: .lines(.init(entries: [
        .init(id: 1, time: "00:00", speaker: .me, settled: "initial transcript"),
    ])))
}

private struct ObservedPanel: View {

    let shown: ObservedPanelState
    let rendered: () -> Void
    let renderedLayout: () -> Void

    var body: some View {
        let _ = rendered()
        PanelView(state: shown.state, event: { _ in })
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
    }
}

@MainActor
private final class PanelLayoutProbe: NSHostingView<ObservedPanel> {

    override func layout() {
        rootView.renderedLayout()
        super.layout()
    }
}

@MainActor
private final class ProfiledPanelLayoutProbe: SignpostedPanelHost<ObservedPanel> {

    override func layout() {
        rootView.renderedLayout()
        super.layout()
    }
}

private final class TranscriptLayoutProbe: NSTextLayoutManager, NSTextLayoutManagerDelegate {

    let markers: Values<String>
    private var pending: [NSTextLayoutFragment] = []

    init(markers: Values<String>) {
        self.markers = markers
        super.init()
        delegate = self
    }

    @available(*, unavailable)
    required init?(coder: NSCoder) { fatalError("init(coder:) is not supported") }

    override func ensureLayout(for range: NSTextRange) {
        super.ensureLayout(for: range)
        completedLayouts()
    }

    override func ensureLayout(for bounds: CGRect) {
        super.ensureLayout(for: bounds)
        completedLayouts()
    }

    func textLayoutManager(
        _ textLayoutManager: NSTextLayoutManager,
        textLayoutFragmentFor location: any NSTextLocation,
        in textElement: NSTextElement
    ) -> NSTextLayoutFragment {
        let fragment = NSTextLayoutFragment(textElement: textElement, range: nil)
        #expect(fragment.state == .none)
        markers.append("text layout")
        pending.append(fragment)
        return fragment
    }

    private func completedLayouts() {
        // A cached ensureLayout call does no text layout work.
        pending.removeAll { fragment in
            guard fragment.state == .layoutAvailable else { return false }
            markers.append("text laid out")
            return true
        }
    }
}

@MainActor
private func panelText(in view: NSView) -> NSTextView? {
    if let text = view as? NSTextView { return text }
    return view.subviews.lazy.compactMap(panelText(in:)).first
}
