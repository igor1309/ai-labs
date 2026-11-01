import AVFoundation
import CallAppProcesses
import CallFolder
import Compose
import Foundation
import LiveText
import struct MicrophoneCapture.AudioPiece
import PanelUI
import ParakeetRecognizer
import protocol RecordedCapture.Track
import SessionRehearsal
import struct SystemAudioCapture.AudioPiece

// ProfileSpeech LINES SECONDS MINE.wav THEIRS.wav: plays a call to LINES with the fake
// recogniser, then switches both sides to the real one and feeds speech at 1× for
// SECONDS. Prints one line per event for speech-report.py:
//   start T0
//   hear SIDE START END AUDIO_END FINAL_THROUGH LAST_END LAST_WORD (times in seconds;
//     audio times from the switch; FINAL_THROUGH and LAST_END are -1 when absent)
//   panel SIDE T LAST_END

func now() -> Double { Double(DispatchTime.now().uptimeNanoseconds) / 1e9 }

/// Everything measured, kept in memory so printing does not slow the run.
actor Recorder {

    private var lines: [String] = []
    private var waiting: [String: [(word: String, end: Double)]] = [:]

    func started(at time: Double) { lines.append("start \(time)") }

    func heard(side: String, start: Double, end: Double, audioEnd: Double, hearing: Hearing) {

        let last = hearing.words.last
        lines.append("hear \(side) \(start) \(end) \(audioEnd) \(hearing.finalThrough ?? -1) \(last?.end ?? -1) \(last?.text ?? "-")")
        if let last { waiting[side, default: []].append((last.text, last.end)) }
    }

    /// A word has reached the panel once its side's newest line ends with it.
    func shown(side: String, text: String, at time: Double) {

        guard let queue = waiting[side], let found = queue.lastIndex(where: { text.hasSuffix($0.word) }) else { return }
        lines.append("panel \(side) \(time) \(queue[found].end)")
        waiting[side] = Array(queue[(found + 1)...])
    }

    func printAll() { for line in lines { print(line) } }
}

/// The fake recogniser until `switchToReal`, then the real one measured: its
/// times are moved to follow the fake part's, as one call's would.
actor Switching: Recognizer {

    private let side: String
    private let fake: SpeakingRecognizer
    private let real: any Recognizer
    private let recorder: Recorder
    private var fakeSeconds = 0.0
    private var offset: Double?
    private var finishing: Hearing?
    private var realSeconds = 0.0

    init(side: String, fake: SpeakingRecognizer, real: any Recognizer, recorder: Recorder) {

        self.side = side
        self.fake = fake
        self.real = real
        self.recorder = recorder
    }

    func switchToReal() async throws {

        finishing = await fake.finish()
        offset = fakeSeconds
    }

    func hear(_ chunk: AudioChunk) async throws -> Hearing {

        let seconds = Double(chunk.samples.count) / chunk.sampleRate
        guard let offset else {
            fakeSeconds += seconds
            return await fake.hear(chunk)
        }
        let start = now()
        let hearing = try await real.hear(chunk)
        realSeconds += seconds
        await recorder.heard(side: side, start: start, end: now(), audioEnd: realSeconds, hearing: hearing)
        var moved = hearing
        moved.words = hearing.words.map { Word($0.text, start: $0.start + offset, end: $0.end + offset) }
        moved.from = hearing.from.map { $0 + offset }
        moved.finalThrough = hearing.finalThrough.map { $0 + offset }
        moved.noWordBefore = hearing.noWordBefore.map { $0 + offset }
        // The fake part's last words go final with the first real report.
        if let last = finishing, moved.words.isEmpty {
            finishing = nil
            return last
        }
        return moved
    }

    func finish() async throws -> Hearing { try await real.finish() }
}

func samples(of path: String) throws -> [Float] {

    let file = try AVAudioFile(forReading: URL(fileURLWithPath: path), commonFormat: .pcmFormatFloat32, interleaved: false)
    let buffer = AVAudioPCMBuffer(pcmFormat: file.processingFormat, frameCapacity: AVAudioFrameCount(file.length))!
    try file.read(into: buffer)
    return Array(UnsafeBufferPointer(start: buffer.floatChannelData![0], count: Int(buffer.frameLength)))
}

/// One call through the app's composition, fed by hand.
final class Call: @unchecked Sendable {

    static let slot = 0.4
    static let rate = 48_000.0

    let root: URL
    let microphone = Feed<MicrophoneCapture.AudioPiece>()
    let call = Feed<SystemAudioCapture.AudioPiece>()
    let sessions: RecordingSessions
    var shown: AsyncStream<PanelState>.Iterator
    var latest: PanelState?
    var slots = 0

    init(mine: Switching, theirs: Switching) async throws {

        root = FileManager.default.temporaryDirectory.appendingPathComponent("audelin-speech-\(getpid())")
        try FileManager.default.createDirectory(at: root, withIntermediateDirectories: true)
        let pieces = SessionPieces(
            folder: CallFolder(callsURL: root, now: { Date() }, timeZone: .current),
            processes: CallAppProcesses(app: "meeting", list: OneCallApp()),
            startMicrophone: { [microphone] in microphone.started() },
            startCall: { [call] _ in call.started() },
            microphoneRecognizer: mine, callRecognizer: theirs,
            missingModels: { [] },
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

    var lines: Int { if case let .lines(lines) = latest?.log { lines.rows.count } else { 0 } }

    func play(toLines count: Int) async {

        while lines < count {
            feed(mine: .init(repeating: 0.25, count: 30 * Int(Self.slot * Self.rate)),
                 theirs: .init(repeating: -0.25, count: 30 * Int(Self.slot * Self.rate)))
            slots += 30
            let word = "mine\(slots / 30 * 20)"
            while let state = await shown.next() {
                latest = state
                if Self.newest(of: .me, in: state)?.hasSuffix(word) == true { break }
            }
        }
    }

    func feed(mine: [Float], theirs: [Float]) {

        microphone.yield(.init(samples: mine, sampleRate: Self.rate))
        call.yield(.init(samples: theirs, sampleRate: Self.rate))
    }

    /// Looks from the end, so reading the panel costs nothing that grows.
    static func newest(of speaker: PanelState.Speaker, in state: PanelState) -> String? {

        guard case let .lines(lines) = state.log else { return nil }
        for row in lines.rows.reversed() {
            switch row {
            case let .entry(entry) where entry.speaker == speaker: return entry.settled + entry.pending
            case let .late(late):
                if let entry = late.entries.last(where: { $0.speaker == speaker }) { return entry.settled + entry.pending }
            default: continue
            }
        }
        return nil
    }

    func end() async {

        await sessions.end(id: 1)
        try? FileManager.default.removeItem(at: root)
    }

    enum Failure: Error { case notStarted(String) }
}

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

let arguments = CommandLine.arguments
guard arguments.count == 5, let lineCount = Int(arguments[1]), let seconds = Int(arguments[2]) else {
    print("usage: ProfileSpeech LINES SECONDS MINE.wav THEIRS.wav")
    exit(2)
}
let mineAudio = try samples(of: arguments[3]), theirsAudio = try samples(of: arguments[4])

// Model loading and the first read stay out of the measured part.
let warm = try await ParakeetRecognizer()
_ = try await warm.hear(AudioChunk(samples: .init(repeating: 0, count: 480_000), sampleRate: 48_000))
_ = try await warm.finish()

let recorder = Recorder()
let mine = Switching(
    side: "mine", fake: SpeakingRecognizer(name: "mine", sentence: 8, pause: 4, offset: 0),
    real: try await ParakeetRecognizer(), recorder: recorder
)
let theirs = Switching(
    side: "theirs", fake: SpeakingRecognizer(name: "theirs", sentence: 10, pause: 5, offset: 6),
    real: try await ParakeetRecognizer(), recorder: recorder
)
let call = try await Call(mine: mine, theirs: theirs)
await call.play(toLines: lineCount)
FileHandle.standardError.write(Data("played to \(call.lines) lines\n".utf8))
try await Task.sleep(for: .seconds(2))
try await mine.switchToReal()
try await theirs.switchToReal()

let reader = Task {
    while let state = await call.shown.next() {
        let time = now()
        call.latest = state
        if let text = Call.newest(of: .me, in: state) { await recorder.shown(side: "mine", text: text, at: time) }
        if let text = Call.newest(of: .them, in: state) { await recorder.shown(side: "theirs", text: text, at: time) }
    }
}

let piece = Int(Call.rate / 10)
await recorder.started(at: now())
let began = ContinuousClock.now
for index in 0..<(seconds * 10) {
    func slice(_ audio: [Float]) -> [Float] {
        let from = (index * piece) % max(audio.count - piece, 1)
        return Array(audio[from..<min(from + piece, audio.count)])
    }
    call.feed(mine: slice(mineAudio), theirs: slice(theirsAudio))
    try await Task.sleep(until: began + .milliseconds(100 * (index + 1)), clock: .continuous)
}
// Lets what is in flight reach the panel.
try await Task.sleep(for: .seconds(8))
reader.cancel()
await recorder.printAll()
FileHandle.standardError.write(Data("done at \(call.lines) lines\n".utf8))
exit(0)
