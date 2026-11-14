import CallDiarizer
import protocol BleedCleanup.MicrophoneCleaning
import protocol BleedCleanup.CleanedHearing
import CallAppProcesses
import CallFolder
import CallText
import Foundation
import LiveText
import SessionRehearsal
import struct SideText.Audio
import SummaryJobs
import SummaryFiles
import Preferences
import Testing
import TranscriptFormat
@testable import Composer

@Suite(.timeLimit(.minutes(1)))
struct BleedCleanupCompositionTests {
    @Test(arguments: [false, true])
    func quitHandsOffRawBeforeSummaryShutdown(holdingHearing: Bool) async throws {
        try await withComposeFolder { root in
            let held = HeldCleanupStep()
            let cancelled = Signal(), terminated = Signal()
            defer { cancelled.end(); terminated.end() }
            let words: [Word] = [.init("shared", start: 0, end: 0.01), .init("words", start: 0.01, end: 0.02)]
            func recognizer() -> ScriptRecognizer {
                ScriptRecognizer(hearings: [.success(.init(words: words))], endings: [.success(.init(words: words))])
            }
            let rig = try await ComposeFixture.make(root: root,
                preferences: Preferences(notes: .init(enabled: true), automaticRecording: false, callsFolder: root),
                recognizers: (recognizer(), recognizer()), configure: { boundary in
                    boundary.bleedCleaning = CleaningStub { _ in
                        if !holdingHearing {
                            await withTaskCancellationHandler { await held.wait() } onCancel: { cancelled.send() }
                        }
                        return [0]
                    }
                    boundary.bleedHearing = HearingStub { _ in
                        if holdingHearing {
                            await withTaskCancellationHandler { await held.wait() } onCancel: { cancelled.send() }
                        } else { Issue.record("Cancelled cleaning reached hearing") }
                        return [segment("cleaned answer", start: 0)]
                    }
                }, terminate: {
                    // Durable acceptance proves the handoff preceded coordinator shutdown.
                    do {
                        let record = try JSONDecoder().decode(Record.self, from: Data(contentsOf:
                            root.appendingPathComponent("1970.01.01-0000/.summary-job.json")))
                        #expect(record.phase == "pending")
                        let snapshot = try #require(try JSONSerialization.jsonObject(with: record.snapshot) as? [String: Any])
                        let entries = try #require(snapshot["entries"] as? [[String: String]])
                        #expect(entries.compactMap { $0["text"] } == ["shared words", "shared words"])
                        #expect(Set(entries.compactMap { $0["label"] }) == ["Me", "Them"])
                    } catch { Issue.record(error) }
                    terminated.send()
                })
            do {
                try await rig.start()
                try await rig.stop()
                await held.started.next()
                let before = try await transcriptText(of: rig)
                await rig.menu.perform(.quit)
                await terminated.next()
                await cancelled.next()
                #expect(try await transcriptText(of: rig) == before)
                await held.release()
                await rig.log.wait { $0.message.hasPrefix("bleed cleanup kept raw:") }
                #expect(try await transcriptText(of: rig) == before)
                await rig.finish()
            } catch { await held.release(); await rig.finish(); throw error }
        }
    }

    @Test
    func sessionClosesWhileCleanupIsHeld() async throws {
        let started = Signal(), release = Signal(), replaced = Signal()
        defer { started.end(); release.end(); replaced.end() }
        let words: [Word] = [.init("shared", start: 0, end: 0.01), .init("words", start: 0.01, end: 0.02)]
        func recognizer() -> ScriptRecognizer {
            ScriptRecognizer(hearings: [.success(.init(words: words))], endings: [.success(.init(words: words))])
        }
        try await withComposition(recognizers: (recognizer(), recognizer()), configure: { boundary in
            boundary.bleedCleaning = CleaningStub { _ in started.send(); await release.next(); return [0] }
            boundary.bleedHearing = HearingStub { _ in [segment("cleaned answer", start: 0)] }
            boundary.transcripts = ReplacementStorage(fails: false, replaced: { replaced.send() })
        }) { rig in
            try await rig.start()
            try await rig.stop()
            await started.next()
            #expect(try await rig.state { $0.phase == .idle }.phase == .idle)
            #expect(try await transcriptText(of: rig).contains("shared words"))
            release.send()
            await replaced.next()
            #expect(try await transcriptText(of: rig).contains("cleaned answer"))
        }
    }

    @Test
    func cleanupHearsEverySampleAndFinalWordsThroughLiveText() async throws {
        let recognizer = ScriptRecognizer(hearings: [
            .success(.init(words: [.init("temporary", start: 0, end: 0.2)])),
            .success(.init(words: [.init("temporary", start: 0, end: 0.2)])),
        ], endings: [.success(.init(words: [.init("final", start: 0, end: 0.2), .init("answer", start: 1, end: 1.1)]))])
        let sides = Values<ComposerSide>()
        let hearing = CleanupHearing(recognizers: FixtureRecognizers(source: { side in
            sides.append(side)
            return RehearsalRecognizer(recognizer)
        }, missing: { [] }, load: { Task {} }))
        let samples = Array(repeating: Float(0.25), count: 16_003)
        let result = try #require(try await hearing.hear(samples))
        #expect(result.flatMap(\.words).map(\.text) == ["final", "answer"])
        #expect(result.allSatisfy { $0.settledCount == $0.words.count })
        #expect(await recognizer.chunks.map(\.sampleRate) == [16_000, 16_000])
        #expect(await recognizer.chunks.flatMap(\.samples) == samples)
        #expect(await recognizer.finishes == 1)
        #expect(sides.all == [.microphone])
    }
}

struct CleaningStub: MicrophoneCleaning {
    let perform: @Sendable (CleanupRecording) async throws -> [Float]
    func clean(_ recording: CleanupRecording) async throws -> [Float] { try await perform(recording) }
}
struct HearingStub: CleanedHearing {
    let perform: @Sendable ([Float]) async throws -> [TranscriptSegment]?
    func hear(_ samples: [Float]) async throws -> [TranscriptSegment]? { try await perform(samples) }
}
private enum CleanupFailure: Error { case failed }
private struct ReplacementStorage: TranscriptStorage {
    let fails: Bool
    var replaced: @Sendable () -> Void = {}
    func open(at url: URL, names: RecordingNames, sink: any LogSink) async throws -> OpenedTranscript {
        let opened = try await FileTranscriptStorage(diarizer: CallDiarizer.unavailable).open(at: url, names: names, sink: sink)
        return OpenedTranscript(writer: ReplacementFile(base: opened.writer, fails: fails, replaced: replaced), pass: opened.pass, names: opened.names)
    }
}
private struct ReplacementFile: TranscriptWriter {
    let base: any TranscriptWriter
    let fails: Bool
    let replaced: @Sendable () -> Void
    func write(_ state: CallState) async throws { try await base.write(state) }
    func close() async { await base.close() }
    func replaceWhole(_ segments: [TranscriptFormat.Segment], speakers: [TranscriptFormat.Speaker]) async throws {
        if fails { throw CleanupFailure.failed }
        try await base.replaceWhole(segments, speakers: speakers)
        replaced()
    }
}
private func segment(_ text: String, start: Double) -> TranscriptSegment {
    let words = text.split(separator: " ").enumerated().map {
        Word(String($0.element), start: start + Double($0.offset) * 0.1, end: start + Double($0.offset + 1) * 0.1)
    }
    return .init(id: Int(start), start: start, end: start + 1, words: words, settledCount: words.count)
}
/// Holds the model call even after cancellation, until the test releases it.
private actor HeldCleanupStep {
    nonisolated let started = Signal()
    private var continuation: CheckedContinuation<Void, Never>?
    func wait() async {
        await withCheckedContinuation { continuation in
            self.continuation = continuation
            started.send()
        }
    }
    func release() { continuation?.resume(); continuation = nil }
    deinit { started.end() }
}
