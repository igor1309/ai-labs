import AVFAudio
import BlockingTestWork
import struct CallText.State
import Darwin
import Foundation
import LiveText
import PanelUI
import Session
import SessionRehearsal
import Synchronization
import Testing
import Composer

/// A long call in compressed time through the composed session: both tracks
/// recorded to their files, Live text on, the transcript written, with a
/// recogniser that speaks in sentences. Two minutes of audio by default;
/// AUDELIN_ENDURANCE_MINUTES sets a longer call, such as 180.
@Suite(.timeLimit(.minutes(60)))
@MainActor
struct SessionEnduranceTests {

    static let minutes = ProcessInfo.processInfo.environment["AUDELIN_ENDURANCE_MINUTES"].flatMap(Double.init) ?? 2

    @Test func aLongCallRecordsBothTracksWholeAndWritesTheTranscript() async throws {

        let rate = 48_000.0
        let micFrames = 1024, callFrames = 512
        let seconds = Self.minutes * 60
        let mine = SpeakingRecognizer(name: "mine", sentence: 8, pause: 4, offset: 0)
        let theirs = SpeakingRecognizer(name: "theirs", sentence: 10, pause: 5, offset: 6)
        try await withComposition(recognizers: (mine, theirs), configure: { $0.processes = FixtureProcesses(binding: CallBinding(fails: false)) }) { rig in
            let folder = rig.folder("1970.01.01-0000 Zoom")
            // The panel reads every text state, as the app's does; unread, they would pile up.
            let text = await rig.menu.panelStates()
            let shown = Shown()
            let reader = Task {
                var states = 0, repeats = 0
                var previous: PanelState?
                for await state in text {
                    if case let .lines(lines) = state.log {
                        shown.set(lines.entries)
                    }
                    if state.recording == .off && states > 0 { break }
                    states += 1
                    if state == previous { repeats += 1 }
                    previous = state
                }
                return (states, repeats)
            }
            _ = try await rig.state { $0.callOn }
            try await rig.start()

            let started = ContinuousClock.now
            var window = started
            let step = 10.0
            var fed = 0.0
            var micSent = 0, callSent = 0
            let micPiece = CaptureBuffer(samples: .init(repeating: 0.25, count: micFrames), sampleRate: rate)
            let callPiece = CaptureBuffer(samples: .init(repeating: -0.25, count: callFrames), sampleRate: rate)
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

            try await rig.stop()
            let ended = try await rig.state { $0.phase == .idle }
            let (textStates, repeats) = await reader.value
            log("panel read \(textStates) text states, \(repeats) the same as the one before")
            // The text changes as words arrive, a few times a second on each side.
            #expect(repeats == 0)
            #expect(Double(textStates) / seconds <= 10)
            log("ended in \(ContinuousClock.now - started); failures \(ended.faults), footprint \(footprintMiB()) MiB")
            #expect(ended.faults.isEmpty)
            let finalSession = try #require(rig.log.entries.all.last { $0.category == .session && $0.message.hasPrefix("state ") })
            #expect(finalSession.message.contains("phase=ended"))
            #expect(finalSession.error == nil)

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

/// The panel's entries as last shown.
final class Shown: Sendable {

    private let entries = Mutex<[PanelState.Entry]>([])

    func set(_ new: [PanelState.Entry]) { entries.withLock { $0 = new } }

    var allWords: [String] { entries.withLock { $0 }.flatMap { tokens($0.settled + " " + $0.pending) } }
    var recentWords: [String] { entries.withLock { $0.suffix(4) }.flatMap { tokens($0.settled + " " + $0.pending) } }
}

func tokens(_ text: String) -> [String] {

    text.split { !$0.isLetter && !$0.isNumber }.map(String.init)
}

/// Waits for a condition, failing with what it waited for once a slow
/// machine would long have met it, so a lost piece fails here, not at the
/// package's time limit.
func waitUntil(_ what: String, seconds: Double = 20, isolation: isolated (any Actor)? = #isolation, _ condition: () async -> Bool) async throws {

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
