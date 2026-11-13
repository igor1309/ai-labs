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
    enum Scenario: CaseIterable {
        case cleaned, ungated, differentWordTimes, longRecording, silent, emptyWords, cleaningFails, hearingFails, replacingFails, finalWriteFails
    }

    @Test(arguments: Scenario.allCases)
    func closedTranscriptAndSummaryAgree(scenario: Scenario) async throws {
        try await withComposeFolder { root in
            let callSegment = segment(scenario == .ungated ? "their own speech" : "shared words here", start: 0)
            let timedCall = scenario == .differentWordTimes ? TranscriptSegment(
                id: callSegment.id, start: callSegment.start, end: 21,
                words: callSegment.words.map { Word($0.text, start: $0.start + 20, end: $0.end + 20) },
                settledCount: callSegment.settledCount
            ) : callSegment
            let raw = try await publishedCall(status: scenario == .finalWriteFails ? .off : .finished, mine: [.init(text: segment("shared words here", start: 1))],
                theirs: [.init(text: timedCall)])
            let heard = [segment("my actual answer", start: 3), segment("one more thought", start: 5)]
            let cleaningCalls = Values<CleanupRecording>(), hearingCalls = Values<[Float]>()
            let summaries = AsyncStream<SummaryResult>.makeStream()
            defer { summaries.continuation.finish() }
            let log = FixtureLog()
            var boundary = testBoundary()
            boundary.log = log
            boundary.bleedCleaning = CleaningStub { recording in
                cleaningCalls.append(recording)
                if scenario == .cleaningFails { throw CleanupFailure.failed }
                return [0.25, -0.5]
            }
            boundary.bleedHearing = HearingStub { samples in
                hearingCalls.append(samples)
                if scenario == .hearingFails { throw CleanupFailure.failed }
                if scenario == .silent { return nil }
                if scenario == .emptyWords { return [.init(id: 0, start: 0, end: 1, words: [], settledCount: 0)] }
                return heard
            }
            boundary.transcripts = ReplacementStorage(fails: scenario == .replacingFails, failFinal: scenario == .finalWriteFails)
            let pieces = SessionPieces(
                folder: CallFolder(callsURL: root, now: { Date(timeIntervalSince1970: 0) }, timeZone: .gmt,
                    occupiedNames: { [] }, disk: .system), folderTitle: nil,
                processes: CallAppProcesses(app: "", list: EmptyProcessList()), boundary: boundary, cleanupRuns: CleanupRuns(),
                summaries: .init(waiting: { _ in }, completed: { folder, entries, final, usable in
                    summaries.continuation.yield(.init(folder: folder, entries: entries, final: final, usable: usable))
                }))
            let folder = try await pieces.create()
            let made = try await pieces.places(in: folder)
            // Audio length, rather than the last recognised word, decides the leak rate.
            let sides = await pieces.sides
            sides[.microphone]!.audio.attach(EndedAudio(capturedThrough: scenario == .longRecording ? 120 : 60))
            sides[.call]!.audio.attach(EndedAudio(capturedThrough: 60))
            try await pieces.openTranscript(in: folder)
            let file = try #require(await pieces.transcriptFile)
            let old = try await publishedCall(status: .off, mine: [.init(text: segment("obsolete words", start: 0))], theirs: [])
            try await file.write(old)
            try await file.write(raw)
            if scenario == .finalWriteFails {
                let final = try await publishedCall(status: .finished,
                    mine: [.init(text: segment("new final words", start: 1))], theirs: [])
                await #expect(throws: CleanupFailure.self) { try await file.write(final) }
            }
            let before = try String(contentsOf: made.transcriptURL, encoding: .utf8)
            try await pieces.closeTranscript()
            var results = summaries.stream.makeAsyncIterator()
            let summary = try #require(await results.next())
            let replaced = scenario == .cleaned
            let expectedSegments = replaced ? Transcript.replacingMicrophone(in: raw, with: heard) : Transcript.segments(from: raw)
            var format = TranscriptFormat()
            let expected = try format.render(expectedSegments).chunks.reduce(Data(), +)
            #expect(try Data(contentsOf: made.transcriptURL) == expected)
            if !replaced { #expect(try String(contentsOf: made.transcriptURL, encoding: .utf8) == before) }
            #expect(summary.folder == made.url)
            #expect(summary.entries == (replaced ? [
                .init(label: "Them", time: "0.0", text: "shared words here"),
                .init(label: "Me", time: "3.0", text: "my actual answer"),
                .init(label: "Me", time: "5.0", text: "one more thought"),
            ] : [
                .init(label: "Them", time: "0.0", text: scenario == .ungated ? "their own speech" : "shared words here"),
                .init(label: "Me", time: "1.0", text: "shared words here"),
            ]))
            #expect(summary.final == (scenario != .finalWriteFails))
            #expect(summary.usable)
            let gated = scenario != .ungated && scenario != .differentWordTimes && scenario != .longRecording && scenario != .finalWriteFails
            #expect(cleaningCalls.all == (gated ? [.init(microphoneURL: made.microphoneURL, callURL: made.callURL)] : []))
            #expect(hearingCalls.all == (gated && scenario != .cleaningFails ? [[0.25, -0.5]] : []))
            if scenario == .replacingFails {
                await log.wait { $0.message == "bleed cleanup kept raw: replacing failed" }
            }
            let kept = log.entries.all.filter { $0.message.hasPrefix("bleed cleanup kept raw:") }
            if replaced { #expect(kept.isEmpty) }
            else if scenario == .finalWriteFails { #expect(kept.isEmpty) }
            else if !gated {
                #expect(kept == [.init(category: .session, message: "bleed cleanup kept raw: no bleed found", level: .debug)])
            } else if scenario == .silent || scenario == .emptyWords {
                #expect(kept == [.init(category: .session, message: "bleed cleanup kept raw: nothing heard")])
            } else {
                let step = scenario == .cleaningFails ? "cleaning" : scenario == .hearingFails ? "hearing" : "replacing"
                #expect(kept == [.init(category: .session, message: "bleed cleanup kept raw: \(step) failed", error: "failed")])
            }
        }
    }

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
    func replacementKeepsTheClosedCallsSpeakerNamesWhenAnotherCallStarts() async throws {
        let raw = try await publishedCall(status: .finished, mine: [], theirs: [.init(text: segment("their words", start: 0))])
        let bytes = MemoryTranscriptBytes()
        let names = LiveNameBoard()
        names.give([0: "Anna"])
        let writer = WritingTranscript(file: bytes, format: TranscriptFormat(), names: names, diarizer: .unused, sink: TestLogSink())
        try await writer.write(raw)
        await writer.close()
        names.reset()
        names.give([0: "Boris"])
        try await writer.replaceMicrophone(in: raw, with: [segment("my words", start: 1)])
        let replacement = await bytes.replacement
        #expect(replacement.contains("**Them** 00:00:00\ntheir words"))
        #expect(replacement.contains("- Them: Anna"))
        #expect(!replacement.contains("Boris"))
        #expect(replacement.contains("my words"))
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

private struct SummaryResult: Sendable {
    let folder: URL
    let entries: [Job.Entry]
    let final: Bool
    let usable: Bool
}
private enum CleanupFailure: Error { case failed }
struct CleaningStub: MicrophoneCleaning {
    let perform: @Sendable (CleanupRecording) async throws -> [Float]
    func clean(_ recording: CleanupRecording) async throws -> [Float] { try await perform(recording) }
}
struct HearingStub: CleanedHearing {
    let perform: @Sendable ([Float]) async throws -> [TranscriptSegment]?
    func hear(_ samples: [Float]) async throws -> [TranscriptSegment]? { try await perform(samples) }
}
private struct EmptyProcessList: ProcessList {
    func processes() async throws -> [AudioProcess] { [] }
}
private struct EndedAudio: CaptureAudio {
    let capturedThrough: Double
    func listen(_ receive: @escaping @Sendable (Audio) async -> Void) async {}
}
private struct ReplacementStorage: TranscriptStorage {
    let fails: Bool
    var failFinal = false
    var replaced: @Sendable () -> Void = {}
    var replacement: @Sendable ([TranscriptSegment]) -> Void = { _ in }
    func open(at url: URL, sink: any LogSink) async throws -> any SessionTranscriptFile {
        ReplacementFile(base: try await FileTranscriptStorage(diarizer: .unavailable).open(at: url, sink: sink), fails: fails, failFinal: failFinal, replaced: replaced, replacement: replacement)
    }
}
private struct ReplacementFile: SessionTranscriptFile {
    let base: any SessionTranscriptFile
    let fails: Bool
    let failFinal: Bool
    let replaced: @Sendable () -> Void
    let replacement: @Sendable ([TranscriptSegment]) -> Void
    func write(_ state: CallState) async throws {
        if failFinal && state.status == .finished { throw CleanupFailure.failed }
        try await base.write(state)
    }
    func close() async { await base.close() }
    func attributeSpeakers() async -> AttributedFar? { await base.attributeSpeakers() }
    func replaceMicrophone(in state: CallState, with segments: [TranscriptSegment]) async throws {
        if fails { throw CleanupFailure.failed }
        try await base.replaceMicrophone(in: state, with: segments)
        replacement(segments)
        replaced()
    }
}
private func segment(_ text: String, start: Double) -> TranscriptSegment {
    let words = text.split(separator: " ").enumerated().map {
        Word(String($0.element), start: start + Double($0.offset) * 0.1, end: start + Double($0.offset + 1) * 0.1)
    }
    return .init(id: Int(start), start: start, end: start + 1, words: words, settledCount: words.count)
}
private func testBoundary() -> ComposerBoundary {
    let empty = ScriptRecognizer(hearings: [], endings: [])
    var boundary = rehearsalBoundary(capturePersistence: .recorded,
        microphone: { StartedCapture(stream: AsyncThrowingStream { $0.finish() }, stop: {}) },
        call: { _ in StartedCapture(stream: AsyncThrowingStream { $0.finish() }, stop: {}) },
        mine: RehearsalRecognizer(empty), theirs: RehearsalRecognizer(empty),
        now: { Date(timeIntervalSince1970: 0) }, timeZone: { .gmt }, sleep: { _ in }, intervals: testIntervals)
    boundary.transcripts = FileTranscriptStorage(diarizer: .unavailable)
    return boundary
}

private actor MemoryTranscriptBytes: TranscriptBytes {
    private(set) var replacement = ""
    func write(_ chunks: [Data], finalLength: Int?) {}
    func replace(_ chunks: [Data], finalLength: Int?) {
        replacement = String(decoding: chunks.reduce(Data(), +), as: UTF8.self)
    }
    func close() {}
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
