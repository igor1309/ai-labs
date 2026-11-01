import CallAppProcesses
import struct CallText.State
import CallFolder
import Compose
import Foundation
import PanelUI
import struct MicrophoneCapture.AudioPiece
import protocol RecordedCapture.Track
import SessionRehearsal
import struct SystemAudioCapture.AudioPiece
import TranscriptFile

// SessionCrashWriter ROOT: a call through the app's composition that never
// ends, so the parent can kill it while the transcript is being saved. After
// each save returns it reports how many entries are final and what the file
// then holds.

/// Reports each save of the real transcript once it returns.
struct ReportingTranscript: SessionTranscriptFile {

    let base: any SessionTranscriptFile
    let url: URL

    func write(_ state: State) async throws {

        try await base.write(state)
        let held = try Data(contentsOf: url).base64EncodedString()
        try FileHandle.standardOutput.write(contentsOf: Data("wrote \(state.finalCount) \(held)\n".utf8))
    }

    func close() async { await base.close() }
}

/// Ends each pause after 10 ms, so saves come often enough to be killed between.
struct QuickClock: Clock {

    private let base = ContinuousClock()

    var now: ContinuousClock.Instant { base.now }
    var minimumResolution: Duration { base.minimumResolution }

    func sleep(until deadline: ContinuousClock.Instant, tolerance: Duration?) async throws {

        try await base.sleep(for: .milliseconds(10))
    }
}

/// A capture fed by hand.
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

    func processes() -> [AudioProcess] { [AudioProcess(pid: 72, bundleID: "meeting", name: "meeting", isAudelin: false)] }
}

let root = URL(fileURLWithPath: CommandLine.arguments[1])
let microphone = Feed<MicrophoneCapture.AudioPiece>()
let call = Feed<SystemAudioCapture.AudioPiece>()
let pieces = SessionPieces(
    folder: CallFolder(callsURL: root, now: { Date(timeIntervalSince1970: 0) }, timeZone: TimeZone(secondsFromGMT: 0)!),
    processes: CallAppProcesses(app: "meeting", list: OneCallApp()),
    startMicrophone: { microphone.started() },
    startCall: { _ in call.started() },
    microphoneRecognizer: SpeakingRecognizer(name: "mine", sentence: 2, pause: 3, offset: 0),
    callRecognizer: SpeakingRecognizer(name: "theirs", sentence: 2, pause: 3, offset: 2.5),
    missingModels: { [] },
    recordingTrack: { _, _ in DroppedTrack() },
    openTranscript: { url in
        ReportingTranscript(base: WritingTranscript(file: try await TranscriptFile(url: url)), url: url)
    },
    transcriptClock: QuickClock()
)
let sessions = RecordingSessions(
    makePieces: { _ in pieces }, liveText: { true }, report: { _, _ in }, panel: AudelinPanel(makeReading: makeReading),
    makeSession: { await makeSession(handler: $0) }
)
guard await sessions.begin(id: 1) == .ready else { exit(1) }
// 0.4 s of audio a step, both sides, until the parent kills the process.
let frames = 19_200
while true {
    microphone.yield(.init(samples: .init(repeating: 0.25, count: frames), sampleRate: 48_000))
    call.yield(.init(samples: .init(repeating: -0.25, count: frames), sampleRate: 48_000))
    try await Task.sleep(for: .milliseconds(5))
}
