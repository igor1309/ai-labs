import AVFAudio
import struct CallText.State
import Foundation
import LiveText
import struct MicrophoneCapture.AudioPiece
import Reading
import Session
import Synchronization
import struct SystemAudioCapture.AudioPiece
import Testing
@testable import Compose

/// A reader that falls behind for a while: the panel on a busy main actor, or
/// a recogniser that stalls. What waits behind it must stay small, the
/// recording must not wait for it, and it must catch up once it moves again.
@Suite(.timeLimit(.minutes(5)))
struct StalledConsumerTests {

    static let rate = 48_000.0

    /// After a stall the panel needs only the newest text, not every state
    /// it missed; a few may be in flight. However long the stall, it shows
    /// every word once it reads again.
    @Test(arguments: [20.0, 60.0])
    func textWaitingForAStalledPanelStaysSmall(stall: Double) async throws {

        let mine = SpeakingRecognizer(name: "mine", sentence: 8, pause: 4, offset: 0)
        let theirs = SpeakingRecognizer(name: "theirs", sentence: 10, pause: 5, offset: 6)
        try await withSessionRig(recognizers: (mine, theirs)) { rig, _ in
            let text = await rig.pieces.readingText()
            let moving = Signal()
            let shown = Shown()
            let read = Mutex(0)
            let reader = Task {
                var reading = ReadingState(), held = true
                for await state in text {
                    if held { await moving.next(); held = false }
                    reading = ReadingReducer.reduce(reading, .textUpdated(readingText(state))).0
                    if case let .lines(lines) = reading.log { shown.set(lines.entries) }
                    read.withLock { $0 += 1 }
                }
            }
            await rig.session.send(.begin(liveText: true))
            _ = try await rig.state { $0.phase == .recording }

            // The call goes on while the panel reads nothing.
            try await feed(seconds: stall, to: rig) { mic, call in
                try await waitUntil("my recogniser hears \(mic) samples") { await mine.heardSamples >= mic }
                try await waitUntil("their recogniser hears \(call) samples") { await theirs.heardSamples >= call }
            }
            // Nothing new is said while the panel catches up, so all it reads waited.
            let myLast = await mine.words, theirLast = await theirs.words
            moving.send()
            try await waitUntil("the panel shows mine\(myLast) and theirs\(theirLast)") {
                let words = Set(shown.recentWords)
                return words.contains("mine\(myLast)") && words.contains("theirs\(theirLast)")
            }
            let waiting = read.withLock { $0 }
            #expect(waiting <= 10, "\(waiting) text states waited for the panel after \(Int(stall)) s")
            for (side, last) in [("mine", myLast), ("theirs", theirLast)] {
                let heard = shown.allWords.filter { $0.hasPrefix(side) && $0.dropFirst(side.count).allSatisfy(\.isNumber) }
                #expect(heard == (1...last).map { "\(side)\($0)" }, "the panel lost or repeated \(side) after the stall")
            }

            await rig.session.send(.end)
            _ = try await rig.state { $0.phase == .ended }
            await rig.subscription.value
            await reader.value
        }
    }

    @Test func aStalledRecogniserNeitherHoldsTheRecordingNorLosesWords() async throws {

        let speaking = SpeakingRecognizer(name: "mine", sentence: 8, pause: 4, offset: 0)
        let mine = HeldRecognizer(speaking)
        let theirs = SpeakingRecognizer(name: "theirs", sentence: 10, pause: 5, offset: 6)
        let written = WrittenFrames()
        var construction = SessionConstruction()
        construction.recordingTrack = { side, file in
            CountedTrack(track: SessionPieces.defaultRecordingTrack(side, file), side: side, written: written)
        }
        try await withSessionRig(construction: construction, recognizers: (mine, theirs)) { rig, folder in
            let text = await rig.pieces.readingText()
            let reader = Task { for await _ in text {} }
            await rig.session.send(.begin(liveText: true))
            _ = try await rig.state { $0.phase == .recording }

            // A minute of the call while my recogniser hears nothing; the
            // recording keeps writing all the while.
            await mine.hold()
            let (micSent, callSent) = try await feed(seconds: 60, to: rig) { mic, call in
                try await waitUntil("their recogniser hears \(call) samples") { await theirs.heardSamples >= call }
                try await waitUntil("my recording writes \(mic) samples while my recogniser is held") {
                    written.microphone >= mic
                }
            }
            #expect(await speaking.heardSamples < micSent / 2, "my recogniser kept hearing while held")
            await mine.release()
            try await waitUntil("my recogniser catches up", seconds: 60) { await speaking.heardSamples >= micSent }

            await rig.session.send(.end)
            let ended = try await rig.state { $0.phase == .ended }
            await rig.subscription.value
            await reader.value
            #expect(ended.failures.isEmpty)
            // The rig's scripted captures add one piece at start and one at stop.
            #expect(try await frames(folder.appendingPathComponent("microphone.caf")) == micSent + 3)
            #expect(try await frames(folder.appendingPathComponent("call.caf")) == callSent + 3)
            let transcript = try String(contentsOf: folder.appendingPathComponent("transcript.md"), encoding: .utf8)
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
func feed(
    seconds: Double, to rig: SessionRig, settle: (Int, Int) async throws -> Void
) async throws -> (Int, Int) {

    let rate = StalledConsumerTests.rate
    let micFrames = 1024, callFrames = 512
    let micPiece = MicrophoneCapture.AudioPiece(samples: .init(repeating: 0.25, count: micFrames), sampleRate: rate)
    let callPiece = SystemAudioCapture.AudioPiece(samples: .init(repeating: -0.25, count: callFrames), sampleRate: rate)
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

    Int(try AVAudioFile(forReading: url).length)
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

/// Samples each side's recording track was given to write.
private final class WrittenFrames: Sendable {

    private let counts = Mutex((microphone: 0, call: 0))

    var microphone: Int { counts.withLock { $0.microphone } }

    func add(_ samples: Int, to side: SessionSide) {

        counts.withLock { side == .microphone ? ($0.microphone += samples) : ($0.call += samples) }
    }
}

private struct CountedTrack: RecordingTrack {

    let track: any RecordingTrack
    let side: SessionSide
    let written: WrittenFrames

    func write(_ samples: [Float], sampleRate: Double) async throws {

        try await track.write(samples, sampleRate: sampleRate)
        written.add(samples.count, to: side)
    }
}
