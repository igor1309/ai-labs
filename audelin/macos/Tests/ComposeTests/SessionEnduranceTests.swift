import AVFAudio
import BlockingTestWork
import struct CallText.State
import Darwin
import Foundation
import LiveText
import struct MicrophoneCapture.AudioPiece
import Reading
import Session
import Synchronization
import struct SystemAudioCapture.AudioPiece
import Testing
@testable import Compose

/// A long call in compressed time through the composed session: both tracks
/// recorded to their files, Live text on, the transcript written, with a
/// recogniser that speaks in sentences. Two minutes of audio by default;
/// AUDELIN_ENDURANCE_MINUTES sets a longer call, such as 180.
@Suite(.timeLimit(.minutes(60)))
struct SessionEnduranceTests {

    static let minutes = ProcessInfo.processInfo.environment["AUDELIN_ENDURANCE_MINUTES"].flatMap(Double.init) ?? 2

    @Test func aLongCallRecordsBothTracksWholeAndWritesTheTranscript() async throws {

        let rate = 48_000.0
        let micFrames = 1024, callFrames = 512
        let seconds = Self.minutes * 60
        let mine = SpeakingRecognizer(name: "mine", sentence: 8, pause: 4, offset: 0)
        let theirs = SpeakingRecognizer(name: "theirs", sentence: 10, pause: 5, offset: 6)
        try await withSessionRig(recognizers: (mine, theirs)) { rig, folder in
            // The panel reads every text state, as the app's does; unread, they would pile up.
            let text = await rig.pieces.readingText()
            let shown = Shown()
            let reader = Task {
                var states = 0, repeats = 0
                var previous: State?
                var reading = ReadingState()
                for await state in text {
                    reading = ReadingReducer.reduce(reading, .textUpdated(readingText(state))).0
                    if case let .lines(lines) = reading.log { shown.set(lines.entries) }
                    states += 1
                    if state == previous { repeats += 1 }
                    previous = state
                }
                return (states, repeats)
            }
            await rig.session.send(.begin(liveText: true))
            _ = try await rig.state { $0.phase == .recording }

            let started = ContinuousClock.now
            var window = started
            let step = 10.0
            var fed = 0.0
            var micSent = 0, callSent = 0
            let micPiece = MicrophoneCapture.AudioPiece(samples: .init(repeating: 0.25, count: micFrames), sampleRate: rate)
            let callPiece = SystemAudioCapture.AudioPiece(samples: .init(repeating: -0.25, count: callFrames), sampleRate: rate)
            while fed < seconds {
                fed = min(seconds, fed + step)
                let target = Int(fed * rate)
                while micSent + micFrames <= target { rig.microphone.source.continuation.yield(micPiece); micSent += micFrames }
                while callSent + callFrames <= target { rig.call.source.continuation.yield(callPiece); callSent += callFrames }
                // Live text hears what was fed before more is fed, so no stream holds more than a step.
                try await waitUntil("my recogniser hears \(micSent) samples") { await mine.heardSamples >= micSent }
                try await waitUntil("their recogniser hears \(callSent) samples") { await theirs.heardSamples >= callSent }
                // The panel keeps up: what each side said by now is on screen.
                let myLast = await mine.words, theirLast = await theirs.words
                try await waitUntil("the panel shows mine\(myLast) and theirs\(theirLast)") {
                    let words = Set(shown.recentWords)
                    return (myLast == 0 || words.contains("mine\(myLast)")) && (theirLast == 0 || words.contains("theirs\(theirLast)"))
                }
                if Int(fed) % 600 == 0 {
                    let state = try await rig.state { _ in true }
                    let now = ContinuousClock.now
                    log("\(Int(fed) / 60) min: last 10 min took \(now - window), footprint \(footprintMiB()) MiB, "
                        + "phase \(state.phase), mine \(await mine.words) words, theirs \(await theirs.words) words")
                    window = now
                }
            }
            log("fed \(Int(seconds / 60)) min in \(ContinuousClock.now - started)")

            await rig.session.send(.end)
            let ended = try await rig.state { $0.phase == .ended }
            await rig.subscription.value
            let (textStates, repeats) = await reader.value
            log("panel read \(textStates) text states, \(repeats) the same as the one before")
            // The text changes as words arrive, a few times a second on each side.
            withKnownIssue("a hearing that changes nothing still publishes its text") {
                #expect(repeats == 0)
            }
            withKnownIssue("the last entry ends where the audio was heard through, so every piece is a new state") {
                #expect(Double(textStates) / seconds <= 10)
            }
            log("ended in \(ContinuousClock.now - started); failures \(ended.failures), footprint \(footprintMiB()) MiB")
            #expect(ended.failures.isEmpty)

            // The rig's scripted captures add one piece at start and one at stop.
            #expect(try await frames(folder.appendingPathComponent("microphone.caf")) == micSent + 3)
            #expect(try await frames(folder.appendingPathComponent("call.caf")) == callSent + 3)
            let transcript = try await offPool {
                try String(contentsOf: folder.appendingPathComponent("transcript.md"), encoding: .utf8)
            }
            let entries = transcript.components(separatedBy: "\n**").count - 1
            let longest = transcript.components(separatedBy: "\n\n").map(\.count).max() ?? 0
            log("transcript: \(transcript.utf8.count) bytes, \(entries) entries, longest entry \(longest) characters")
            #expect(transcript.contains("**Me**"))
            #expect(transcript.contains("**Them**"))
            #expect(entries >= Int(seconds / 15))

            // Every word each side said, once and in order, on screen and in the file.
            let said = (mine: (1...(await mine.words)).map { "mine\($0)" }, theirs: (1...(await theirs.words)).map { "theirs\($0)" })
            for (place, words) in [("panel", shown.allWords), ("transcript", tokens(transcript))] {
                for (side, expected) in [("mine", said.mine), ("theirs", said.theirs)] {
                    let heard = words.filter { $0.hasPrefix(side) && $0.dropFirst(side.count).allSatisfy(\.isNumber) }
                    let difference = heard.difference(from: expected)
                    #expect(difference.removals.isEmpty, "\(place) lost \(difference.removals.count) of \(expected.count) of \(side)")
                    #expect(difference.insertions.isEmpty, "\(place) has \(difference.insertions.count) of \(side) twice or out of order")
                }
            }
        }
    }
}

/// Speaks a word every 0.4 s in sentences of `sentence` seconds with `pause`
/// seconds of silence between them; words are final a second after they end.
actor SpeakingRecognizer: Recognizer {

    private let name: String
    private let sentence: Double
    private let pause: Double
    private let offset: Double
    private var heard = 0.0
    private var rate = 48_000.0
    private var nextWord = 0.0
    private var pending: [Word] = []
    private(set) var heardSamples = 0
    private(set) var words = 0

    init(name: String, sentence: Double, pause: Double, offset: Double) {

        self.name = name
        self.sentence = sentence
        self.pause = pause
        self.offset = offset
        nextWord = offset
    }

    func hear(_ chunk: AudioChunk) -> Hearing {

        rate = chunk.sampleRate
        heardSamples += chunk.samples.count
        heard = Double(heardSamples) / rate
        while nextWord + 0.3 <= heard {
            let inCycle = (nextWord - offset).truncatingRemainder(dividingBy: sentence + pause)
            if inCycle < sentence {
                words += 1
                pending.append(Word("\(name)\(words)", start: nextWord, end: nextWord + 0.3))
            }
            nextWord += 0.4
        }
        return report(finalThrough: heard - 1)
    }

    func finish() -> Hearing { report(finalThrough: heard) }

    private func report(finalThrough: Double) -> Hearing {

        let hearing = Hearing(words: pending, from: pending.first?.start ?? heard, finalThrough: finalThrough)
        pending.removeAll { $0.end <= finalThrough }
        return hearing
    }
}

/// The panel's entries as last shown.
final class Shown: Sendable {

    private let entries = Mutex<[ReadingState.Entry]>([])

    func set(_ new: [ReadingState.Entry]) { entries.withLock { $0 = new } }

    var allWords: [String] { entries.withLock { $0 }.flatMap { tokens($0.settled + " " + $0.pending) } }
    var recentWords: [String] { entries.withLock { $0.suffix(4) }.flatMap { tokens($0.settled + " " + $0.pending) } }
}

func tokens(_ text: String) -> [String] {

    text.split { !$0.isLetter && !$0.isNumber }.map(String.init)
}

/// Waits for a condition, failing with what it waited for once a slow
/// machine would long have met it, so a lost piece fails here, not at the
/// package's time limit.
func waitUntil(_ what: String, seconds: Double = 20, _ condition: () async -> Bool) async throws {

    let deadline = ContinuousClock.now + .seconds(seconds)
    while !(await condition()) {
        guard ContinuousClock.now < deadline else {
            Issue.record("waited \(Int(seconds)) s for \(what)")
            throw CancellationError()
        }
        await Task.yield()
    }
}

private func frames(_ url: URL) async throws -> Int {

    try await offPool { Int(try AVAudioFile(forReading: url).length) }
}

private func log(_ line: String) {

    FileHandle.standardError.write(Data("endurance: \(line)\n".utf8))
}

private func footprintMiB() -> Int {

    var info = task_vm_info_data_t()
    var count = mach_msg_type_number_t(MemoryLayout<task_vm_info_data_t>.size / MemoryLayout<natural_t>.size)
    let result = withUnsafeMutablePointer(to: &info) {
        $0.withMemoryRebound(to: integer_t.self, capacity: Int(count)) {
            task_info(mach_task_self_, task_flavor_t(TASK_VM_INFO), $0, &count)
        }
    }
    return result == KERN_SUCCESS ? Int(info.phys_footprint) / 1_048_576 : -1
}
