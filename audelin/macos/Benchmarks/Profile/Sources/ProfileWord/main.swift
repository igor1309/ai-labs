import CallAppProcesses
import CallFolder
import Compose
import Foundation
import struct MicrophoneCapture.AudioPiece
import TranscriptFile
import os
import PanelUI
import protocol RecordedCapture.Track
import SessionRehearsal
import struct SystemAudioCapture.AudioPiece

// ProfileWord words LINES WORDS ROUNDS: plays a call to LINES, then speaks WORDS
// inside a signpost, so a trace can be cut to the words alone.
// ProfileWord paced LINES SECONDS: real speaking speed, counts saves of the file.
// ProfileWord savecost LINES COUNT: one save of a call that size, tail changing.
func cpuSeconds() -> Double {
    var u = rusage(); getrusage(RUSAGE_SELF, &u)
    return Double(u.ru_utime.tv_sec + u.ru_stime.tv_sec) + Double(u.ru_utime.tv_usec + u.ru_stime.tv_usec) / 1e6
}
func say(_ s: String) { print(s); fflush(stdout) }
let mode = CommandLine.arguments[1]
let n = Int(CommandLine.arguments[2])!, m = Int(CommandLine.arguments[3])!
if mode == "savecost" {
    let dir = FileManager.default.temporaryDirectory.appendingPathComponent("audelin-savecost-\(getpid())")
    try FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
    let url = dir.appendingPathComponent("transcript.md")
    let file = try await TranscriptFile(url: url)
    var segs = (0..<n).map { i in TranscriptFile.Segment(side: i % 2 == 0 ? .mine : .theirs, start: Double(i) * 6.6,
        settled: (0..<16).map { "mine\($0 + i * 16)" }.joined(separator: " "), pending: "") }
    try await file.write(segs)
    let c0 = cpuSeconds(); let t0 = ContinuousClock.now
    for k in 0..<m {
        let last = segs[n - 1]
        segs[n - 1] = .init(side: last.side, start: last.start, settled: last.settled, pending: "w\(k)")
        try await file.write(segs)
    }
    let wall = ContinuousClock.now - t0
    let size = (try FileManager.default.attributesOfItem(atPath: url.path)[.size] as? Int) ?? 0
    say("savecost lines=\(n) size=\(size / 1024)KB wall/save=\(wall / m) cpu/save=\(String(format: "%.2f", (cpuSeconds() - c0) / Double(m) * 1000))ms")
    try? FileManager.default.removeItem(at: dir)
    exit(0)
}
if mode == "words" {
    let signposter = OSSignposter(subsystem: "dev.igor1309.audelin.profile", category: .pointsOfInterest)
    for round in 0..<Int(CommandLine.arguments[4])! {
        let call = try await Call.played(lines: n)
        let start = call.lines
        let state = signposter.beginInterval("words")
        for _ in 0..<m { await call.speakOneWord() }
        // Lets the transcript writer finish these words inside the window.
        try await Task.sleep(for: .milliseconds(100))
        signposter.endInterval("words", state)
        FileHandle.standardError.write(Data("round \(round): \(start) -> \(call.lines) lines\n".utf8))
        await call.end()
    }
    exit(0)
}
let call = try await Call.played(lines: n)
var transcript: String?
for case let u as URL in FileManager.default.enumerator(at: call.root, includingPropertiesForKeys: nil)?.allObjects ?? [] where u.lastPathComponent == "transcript.md" { transcript = u.path }
guard let path = transcript else { say("no transcript"); exit(1) }
let startLines = call.lines
var inode: UInt64 = 0, saves = 0
let stop = ContinuousClock.now + .seconds(m)
let c0 = cpuSeconds(); let w0 = call.slots
// Polls the inode: each save renames a new file into place.
let watcher = Thread {
    while ContinuousClock.now < stop {
        var st = stat()
        if stat(path, &st) == 0, UInt64(st.st_ino) != inode { inode = UInt64(st.st_ino); saves += 1 }
        usleep(2000)
    }
}
watcher.start()
call.readPanel()
var slots = 0
let began = ContinuousClock.now
while ContinuousClock.now < stop {
    call.feedPaced()
    slots += 1
    try await Task.sleep(until: began + .milliseconds(400 * slots), clock: .continuous)
}
let cpu = cpuSeconds() - c0
say("paced lines=\(startLines)->\(call.lines) secs=\(m) slots=\(slots) saves=\(saves - 1) saves/min=\(Double(saves - 1) * 60 / Double(m)) cpu=\(String(format: "%.1f", cpu / Double(m) * 100))% of one core")
await call.end()
exit(0)

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
    // `growth.sh` with SILENT=1: the other side says nothing the whole call.
    // With QUIET=1: it says one sentence, then nothing.
    let theirs = SpeakingRecognizer(
        name: "theirs", sentence: 10, pause: CommandLine.arguments.contains("quiet") ? 1e9 : 5,
        offset: CommandLine.arguments.contains("silent") ? 1e9 : 6
    )
    let microphone = Feed<MicrophoneCapture.AudioPiece>()
    let call = Feed<SystemAudioCapture.AudioPiece>()
    let sessions: RecordingSessions
    var shown: AsyncStream<PanelState>.Iterator
    var latest: PanelState?
    /// Slots of audio fed to both sides.
    var slots = 0

    static func played(lines: Int) async throws -> Call {

        let began = ContinuousClock.now
        let call = try await Call()
        Call.current = call
        // A sentence and its pause at a time, so getting there is quick.
        while call.lines < lines {
            call.feed(slots: 30)
            await call.waitForWord(Self.spokenWords(through: call.slots))
        }
        FileHandle.standardError.write(Data("played \(call.slots * 4 / 600) min: \(call.lines) lines in the panel in \(ContinuousClock.now - began)\n".utf8))
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

    func feedPaced() { feed(slots: 1) }

    func readPanel() {
        Task { while let state = await shown.next() { latest = state } }
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
            if let last = Self.newestOfMine(in: lines), (last.settled + last.pending).hasSuffix(word) { return }
        }
    }

    /// Looks from the end: `lines.entries` builds the whole call on every
    /// state, which the benchmark would then count as the app's cost.
    private static func newestOfMine(in lines: PanelState.Lines) -> PanelState.Entry? {

        for row in lines.rows.reversed() {
            switch row {
            case let .entry(entry) where entry.speaker == .me: return entry
            case let .late(late):
                if let entry = late.entries.last(where: { $0.speaker == .me }) { return entry }
            default: continue
            }
        }
        return nil
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
