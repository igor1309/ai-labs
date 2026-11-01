import AVFAudio
import struct CallText.State
import Foundation
import LiveText
import Session
import SessionRehearsal
import Synchronization
import Testing
@testable import Compose

/// A piece that fails partway through a long call: the user hears of it,
/// once rather than for every word that follows, and the recording goes on.
@Suite(.timeLimit(.minutes(1)))
struct LongCallFaultTests {

    @Test func aTranscriptThatKeepsFailingIsReportedOnceAndTheRecordingGoesOn() async throws {

        let mine = SpeakingRecognizer(name: "mine", sentence: 8, pause: 4, offset: 0)
        let theirs = SpeakingRecognizer(name: "theirs", sentence: 10, pause: 5, offset: 6)
        let attempts = Attempts()
        var construction = SessionConstruction()
        construction.openTranscript = { url in
            FullDisk(file: try await SessionPieces.defaultOpenTranscript(url), writesBeforeFull: 10, attempts: attempts)
        }
        try await withSessionRig(construction: construction, recognizers: (mine, theirs)) { rig, folder in
            let text = await rig.pieces.readingText()
            let reader = Task { for await _ in text {} }
            await rig.session.send(.begin(liveText: true))
            _ = try await rig.state { $0.phase == .recording }

            // A minute of the call with the disk full for the transcript.
            let (micSent, callSent) = try await feed(seconds: 60, to: rig) { mic, call in
                try await waitUntil("my recogniser hears \(mic) samples") { await mine.heardSamples >= mic }
                try await waitUntil("their recogniser hears \(call) samples") { await theirs.heardSamples >= call }
            }
            let during = try await rig.state { _ in true }

            await rig.session.send(.end)
            let ended = try await rig.state { $0.phase == .ended }
            await rig.subscription.value
            await reader.value
            let reports = ended.failures.filter { $0.piece == "transcript" }.count
            let tried = attempts.count
            #expect(tried > 10, "the transcript was written only \(tried) times")
            #expect(during.phase == .recording, "the call stopped recording when the transcript failed")
            #expect(reports == 1, "\(reports) transcript failures reported for \(tried) writes")
            // The rig's scripted captures add one piece at start and one at stop.
            #expect(try await recordedFrames(folder.appendingPathComponent("microphone.caf")) == micSent + 3)
            #expect(try await recordedFrames(folder.appendingPathComponent("call.caf")) == callSent + 3)
        }
    }

    /// When one side's text fails, the panel says so, the recording goes on
    /// whole, the transcript keeps that side's words heard until then, and
    /// the other side's text goes on to the end of the call.
    @Test func aRecogniserFailingMidCallShowsInThePanelAndTheOtherSideGoesOn() async throws {

        let speaking = SpeakingRecognizer(name: "mine", sentence: 8, pause: 4, offset: 0)
        let mine = FailingRecognizer(speaking, afterSamples: Int(30 * 48_000.0))
        let theirs = SpeakingRecognizer(name: "theirs", sentence: 10, pause: 5, offset: 6)
        try await withSessionRig(recognizers: (mine, theirs)) { rig, folder in
            let text = await rig.pieces.readingText()
            let reader = Task {
                var last: State.Status?
                for await state in text { last = state.status }
                return last
            }
            await rig.session.send(.begin(liveText: true))
            _ = try await rig.state { $0.phase == .recording }

            let (micSent, callSent) = try await feed(seconds: 60, to: rig) { _, call in
                try await waitUntil("their recogniser hears \(call) samples") { await theirs.heardSamples >= call }
            }
            let during = try await rig.state { _ in true }

            await rig.session.send(.end)
            _ = try await rig.state { $0.phase == .ended }
            await rig.subscription.value
            let status = await reader.value
            #expect(during.phase == .recording, "the call stopped recording when my recogniser failed")
            if case .failed = status {} else { Issue.record("the panel's text ended \(String(describing: status)), not failed") }
            // The rig's scripted captures add one piece at start and one at stop.
            #expect(try await recordedFrames(folder.appendingPathComponent("microphone.caf")) == micSent + 3)
            #expect(try await recordedFrames(folder.appendingPathComponent("call.caf")) == callSent + 3)
            let transcript = try String(contentsOf: folder.appendingPathComponent("transcript.md"), encoding: .utf8)
            let words = { (side: String) in
                tokens(transcript).filter { $0.hasPrefix(side) && $0.dropFirst(side.count).allSatisfy(\.isNumber) }
            }
            let mineHeard = words("mine")
            #expect(!mineHeard.isEmpty, "the transcript kept none of mine")
            #expect(mineHeard == (0..<mineHeard.count).map { "mine\($0 + 1)" }, "the transcript lost or repeated mine before the failure")
            // Their side goes on after mine fails.
            #expect(words("theirs") == (1...(await theirs.words)).map { "theirs\($0)" }, "the transcript lost or repeated theirs")
        }
    }
}

/// A transcript whose disk fills after a few writes.
private struct FullDisk: SessionTranscriptFile {

    struct Full: Error {}

    let file: any SessionTranscriptFile
    let writesBeforeFull: Int
    let attempts: Attempts

    func write(_ state: State) async throws {

        let attempt = attempts.next()
        guard attempt <= writesBeforeFull else { throw Full() }
        try await file.write(state)
    }

    func close() async { await file.close() }
}

private final class Attempts: Sendable {

    private let made = Mutex(0)

    var count: Int { made.withLock { $0 } }
    func next() -> Int { made.withLock { $0 += 1; return $0 } }
}

/// Hears through another recogniser until it has heard so many samples, then fails.
private actor FailingRecognizer: Recognizer {

    struct Failed: Error {}

    private let recognizer: any Recognizer
    private let afterSamples: Int
    private var heard = 0

    init(_ recognizer: any Recognizer, afterSamples: Int) {

        self.recognizer = recognizer
        self.afterSamples = afterSamples
    }

    func hear(_ chunk: AudioChunk) async throws -> Hearing {

        heard += chunk.samples.count
        guard heard <= afterSamples else { throw Failed() }
        return try await recognizer.hear(chunk)
    }

    func finish() async throws -> Hearing { try await recognizer.finish() }
}

private func recordedFrames(_ url: URL) async throws -> Int {

    Int(try AVAudioFile(forReading: url).length)
}
