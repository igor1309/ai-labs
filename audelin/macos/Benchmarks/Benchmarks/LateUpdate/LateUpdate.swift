import Benchmark
import CallAppProcesses
import CallFolder
import Compose
import Foundation
import struct MicrophoneCapture.AudioPiece
import PanelUI
import protocol RecordedCapture.Track
import SessionRehearsal
import struct SystemAudioCapture.AudioPiece

// What one new word costs the app as the call grows: the real session and
// panel, both sides speaking through the rehearsal's fake recognisers, with
// live text on and the transcript written. Setup plays the call in large
// chunks until the panel holds the given lines (1,620 is a 3-hour call); each
// iteration then feeds audio until the microphone side speaks one more word,
// and waits until the panel shows it. A hundred words add about ten lines.
//
// Instructions and allocations count all the process's work for that word,
// the transcript writer's included; wall clock is how long the panel took.

let benchmarks: @Sendable () -> Void = {

    for lines in [20, 800, 1_620] {
        Benchmark(
            "One word with \(lines) lines in the panel",
            configuration: .init(
                metrics: [.wallClock, .cpuTotal, .instructions, .mallocCountTotal],
                timeUnits: .microseconds,
                warmupIterations: 10,
                maxDuration: .seconds(20),
                maxIterations: 100
            ),
            closure: { benchmark, call in
                for _ in benchmark.scaledIterations { await call.speakOneWord() }
            },
            setup: { try await Call.played(lines: lines) },
            teardown: { await Call.current?.end() }
        )
    }
}

/// One recorded call through the app's composition, fed by hand.
final class Call: @unchecked Sendable {

    nonisolated(unsafe) static var current: Call?

    // Words fall every 0.4 s; the microphone side speaks 20 slots of every 30
    // (8 s sentences, 4 s pauses), as `SpeakingRecognizer` is set up below.
    static let slot = 0.4
    static let rate = 48_000.0
    static let slotFrames = Int(slot * rate)

    let root: URL
    let mine = SpeakingRecognizer(name: "mine", sentence: 8, pause: 4, offset: 0)
    let theirs = SpeakingRecognizer(name: "theirs", sentence: 10, pause: 5, offset: 6)
    let microphone = Feed<MicrophoneCapture.AudioPiece>()
    let call = Feed<SystemAudioCapture.AudioPiece>()
    let sessions: RecordingSessions
    var shown: AsyncStream<PanelState>.Iterator
    var latest: PanelState?
    /// Slots of audio fed to both sides.
    var slots = 0

    static func played(lines: Int) async throws -> Call {

        let call = try await Call()
        Call.current = call
        // A sentence and its pause at a time, so getting there is quick.
        while call.lines < lines {
            call.feed(slots: 30)
            await call.waitForWord(Self.spokenWords(through: call.slots))
        }
        FileHandle.standardError.write(Data("played \(call.slots * 4 / 600) min: \(call.lines) lines in the panel\n".utf8))
        return call
    }

    var lines: Int { if case let .lines(lines) = latest?.log { lines.rows.count } else { 0 } }

    private init() async throws {

        root = FileManager.default.temporaryDirectory.appendingPathComponent("audelin-bench-\(ProcessInfo.processInfo.processIdentifier)")
        try FileManager.default.createDirectory(at: root, withIntermediateDirectories: true)
        let pieces = SessionPieces(
            folder: CallFolder(callsURL: root, now: { Date() }, timeZone: .current),
            processes: CallAppProcesses(app: "meeting", list: OneCallApp()),
            startMicrophone: { [microphone] in microphone.started() },
            startCall: { [call] _ in call.started() },
            microphoneRecognizer: mine, callRecognizer: theirs,
            missingModels: { [] },
            // The audio tracks cost the same each second however long the
            // call, and three hours of them is gigabytes: they are dropped.
            recordingTrack: { _, _ in DroppedTrack() }
        )
        let panel = AudelinPanel(makeReading: makeReading)
        sessions = RecordingSessions(
            makePieces: { _ in pieces }, liveText: { true }, report: { _, _ in }, panel: panel,
            makeSession: { await makeSession(handler: $0) }
        )
        shown = await panel.states().makeAsyncIterator()
        let begun = await sessions.begin(id: 1)
        guard begun == .ready else { throw Failure.notStarted("\(begun)") }
    }

    func speakOneWord() async {

        repeat { feed(slots: 1) } while !Self.speaks(slot: slots - 1)
        await waitForWord(Self.spokenWords(through: slots))
    }

    func end() async {

        await sessions.end(id: 1)
        try? FileManager.default.removeItem(at: root)
    }

    private func feed(slots count: Int) {

        let frames = count * Self.slotFrames
        microphone.yield(.init(samples: .init(repeating: 0.25, count: frames), sampleRate: Self.rate))
        call.yield(.init(samples: .init(repeating: -0.25, count: frames), sampleRate: Self.rate))
        slots += count
    }

    /// Waits until the panel's newest line of the microphone side ends with
    /// its `number`th word.
    private func waitForWord(_ number: Int) async {

        let word = "mine\(number)"
        while let state = await shown.next() {
            latest = state
            guard case let .lines(lines) = state.log else { continue }
            let last = lines.entries.last { $0.speaker == .me }
            if let last, (last.settled + last.pending).hasSuffix(word) { return }
        }
    }

    private static func speaks(slot: Int) -> Bool { slot % 30 < 20 }

    /// The microphone side's words once `slots` slots are fed: a word is
    /// heard once its 0.3 s have been fed, which is by the end of its slot.
    private static func spokenWords(through slots: Int) -> Int {

        slots / 30 * 20 + min(slots % 30, 20)
    }

    enum Failure: Error {

        case notStarted(String)
    }
}

/// A capture the benchmark feeds by hand.
final class Feed<Piece: Sendable>: Sendable {

    private let source = AsyncThrowingStream<Piece, any Error>.makeStream()

    func started() -> StartedCapture<Piece> {

        StartedCapture(stream: source.stream, stop: { self.source.continuation.finish() })
    }

    func yield(_ piece: Piece) { source.continuation.yield(piece) }
}

private struct DroppedTrack: Track {

    func write(_ samples: [Float], sampleRate: Double) async throws {}
}

private struct OneCallApp: ProcessList {

    func processes() -> [AudioProcess] {

        [AudioProcess(pid: 72, bundleID: "meeting", name: "meeting", isAudelin: false)]
    }
}
