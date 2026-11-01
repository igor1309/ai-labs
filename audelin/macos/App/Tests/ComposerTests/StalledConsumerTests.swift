import AVFAudio
import struct CallText.State
import Foundation
import LiveText
import Reading
import Session
import SessionRehearsal
import Synchronization
import Testing
import Composer
import BlockingTestWork

/// A reader that falls behind for a while: the panel on a busy main actor, or
/// a recogniser that stalls. What waits behind it must stay small, the
/// recording must not wait for it, and it must catch up once it moves again.
@Suite(.timeLimit(.minutes(5)))
@MainActor
struct StalledConsumerTests {

    static let rate = 48_000.0

    @Test func aStalledRecogniserNeitherHoldsTheRecordingNorLosesWords() async throws {

        let speaking = SpeakingRecognizer(name: "mine", sentence: 8, pause: 4, offset: 0)
        let mine = HeldRecognizer(speaking)
        let theirs = SpeakingRecognizer(name: "theirs", sentence: 10, pause: 5, offset: 6)
        try await withComposition(recognizers: (mine, theirs), configure: { $0.processes = FixtureProcesses(binding: CallBinding(fails: false)) }) { rig in
            let folder = rig.folder("1970.01.01-0000 Zoom")
            _ = try await rig.state { $0.callOn }
            try await rig.start()
            defer { Task { await mine.release() } }
            // A minute of the call while my recogniser hears nothing; the
            // recording keeps writing all the while.
            await mine.hold()
            let (micSent, callSent) = try await feed(seconds: 60, to: rig) { mic, call in
                try await waitUntil("their recogniser hears \(call) samples") { await theirs.heardSamples >= call }
                try await waitUntil("my recording writes \(mic) samples while my recogniser is held") {
                    (try? await frames(folder.appendingPathComponent("microphone.caf"))) ?? 0 >= mic
                }
            }
            #expect(await speaking.heardSamples < micSent / 2, "my recogniser kept hearing while held")
            await mine.release()
            try await waitUntil("my recogniser catches up", seconds: 60) { await speaking.heardSamples >= micSent }

            try await rig.stop()
            #expect(rig.log.entries.all.filter { $0.category == .session }.allSatisfy { $0.error == nil })
            // The rig's scripted captures add one piece at start and one at stop.
            #expect(try await frames(folder.appendingPathComponent("microphone.caf")) == micSent + 3)
            #expect(try await frames(folder.appendingPathComponent("call.caf")) == callSent + 3)
            let transcript = try await offPool { try String(contentsOf: folder.appendingPathComponent("transcript.md"), encoding: .utf8) }
            let said = (1...(await speaking.words)).map { "mine\($0)" }
            let heard = tokens(transcript).filter { $0.hasPrefix("mine") && $0.dropFirst(4).allSatisfy(\.isNumber) }
            let difference = heard.difference(from: said)
            #expect(difference.removals.isEmpty, "the transcript lost \(difference.removals.count) of \(said.count) of my words")
            #expect(difference.insertions.isEmpty, "the transcript has \(difference.insertions.count) of my words twice or out of order")
        }
    }
}

/// Feeds both tracks `seconds` of audio in 10-second steps, letting `settle`
/// wait on readers after each, and returns the samples sent per track.
@discardableResult
@MainActor
func feed(
    seconds: Double, to rig: ComposeFixture, settle: (Int, Int) async throws -> Void
) async throws -> (Int, Int) {

    let rate = StalledConsumerTests.rate
    let micFrames = 1024, callFrames = 512
    let micPiece = CaptureBuffer(samples: .init(repeating: 0.25, count: micFrames), sampleRate: rate)
    let callPiece = CaptureBuffer(samples: .init(repeating: -0.25, count: callFrames), sampleRate: rate)
    var fed = 0.0, micSent = 0, callSent = 0
    while fed < seconds {
        fed = min(seconds, fed + 10)
        let target = Int(fed * rate)
        while micSent + micFrames <= target { rig.microphone.source.continuation.yield(micPiece); micSent += micFrames }
        while callSent + callFrames <= target { rig.call.source.continuation.yield(callPiece); callSent += callFrames }
        try await settle(micSent, callSent)
    }
    return (micSent, callSent)
}

private func frames(_ url: URL) async throws -> Int {

    try await offPool { Int(try AVAudioFile(forReading: url).length) }
}

/// Passes hearings through, except while held.
actor HeldRecognizer: Recognizer {

    private let recognizer: any Recognizer
    private var held = false
    private var waiting: [CheckedContinuation<Void, Never>] = []

    init(_ recognizer: any Recognizer) { self.recognizer = recognizer }

    func hold() { held = true }

    func release() {

        held = false
        waiting.forEach { $0.resume() }
        waiting = []
    }

    func hear(_ chunk: AudioChunk) async throws -> Hearing {

        if held { await withCheckedContinuation { waiting.append($0) } }
        return try await recognizer.hear(chunk)
    }

    func finish() async throws -> Hearing { try await recognizer.finish() }
}
