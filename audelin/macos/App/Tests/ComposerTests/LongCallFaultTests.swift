import BlockingTestWork
import AVFAudio
import struct CallText.State
import Foundation
import LiveText
import Session
import SessionRehearsal
import Synchronization
import Testing
import Composer
import PanelUI

/// A piece that fails partway through a long call: the user hears of it,
/// once rather than for every word that follows, and the recording goes on.
@Suite(.timeLimit(.minutes(1)))
@MainActor
struct LongCallFaultTests {

    /// When one side's text fails, the panel says so, the recording goes on
    /// whole, the transcript keeps that side's words heard until then, and
    /// the other side's text goes on to the end of the call.
    @Test func aRecogniserFailingMidCallShowsInThePanelAndTheOtherSideGoesOn() async throws {

        let speaking = SpeakingRecognizer(name: "mine", sentence: 8, pause: 4, offset: 0)
        let mine = FailingRecognizer(speaking, afterSamples: Int(30 * 48_000.0))
        let theirs = SpeakingRecognizer(name: "theirs", sentence: 10, pause: 5, offset: 6)
        try await withComposition(recognizers: (mine, theirs)) { rig in
            let folder = rig.folder()
            try await rig.start()

            let (micSent, callSent) = try await feed(seconds: 60, to: rig) { _, call in
                try await waitUntil("their recogniser hears \(call) samples") { await theirs.heardSamples >= call }
            }
            let during = try await rig.state { _ in true }

            await mine.failed.next()
            let shown = try await rig.panel { if case let .lines(lines) = $0.log { !lines.entries.isEmpty } else { false } }
            if case let .lines(lines) = shown.log {
                #expect(lines.entries.contains { $0.speaker == .me })
                #expect(lines.entries.contains { $0.speaker == .them })
            }
            #expect(during.phase == .recording, "the call stopped recording when my recogniser failed")
            try await rig.stop()
            // The rig's scripted captures add one piece at start and one at stop.
            #expect(try await recordedFrames(folder.appendingPathComponent("microphone.caf")) == micSent + 3)
            #expect(try await recordedFrames(folder.appendingPathComponent("call.caf")) == callSent + 3)
            let transcript = try await offPool { try String(contentsOf: folder.appendingPathComponent("transcript.md"), encoding: .utf8) }
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

/// Hears through another recogniser until it has heard so many samples, then fails.
private actor FailingRecognizer: Recognizer {

    struct Failed: Error {}

    private let recognizer: any Recognizer
    private let afterSamples: Int
    private var heard = 0
    let failed = Signal()

    init(_ recognizer: any Recognizer, afterSamples: Int) {

        self.recognizer = recognizer
        self.afterSamples = afterSamples
    }

    func hear(_ chunk: AudioChunk) async throws -> Hearing {

        heard += chunk.samples.count
        guard heard <= afterSamples else { failed.send(); throw Failed() }
        return try await recognizer.hear(chunk)
    }

    func finish() async throws -> Hearing { try await recognizer.finish() }
}

private func recordedFrames(_ url: URL) async throws -> Int {

    try await offPool { Int(try AVAudioFile(forReading: url).length) }
}
