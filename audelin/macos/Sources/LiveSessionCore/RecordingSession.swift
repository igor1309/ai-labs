import CallDomain
import Foundation

/// What every client shows of recording.
public enum RecordingState: Sendable, Equatable {
    case idle
    case recording(Recording)
}

public struct Recording: Sendable, Equatable {
    public let call: CallID
    public let title: String
    public let start: Date
}

/// Why a recording did not start.
public enum StartRefusal: Error, Sendable, Equatable {
    /// The calls folder is being moved.
    case moving
}

/// The one owner of recording: it starts and stops a call's recording and
/// applies every change in order (ADR-001 decisions 1–3).
public actor RecordingSession {
    private let mic: any AudioCapture
    private let callAudio: any AudioCapture
    private let files: any RecordingFiles
    private let calls: any NewCalls
    private let recognition: any LiveRecognition
    private let gate: ActivityGate
    private let clock: any SessionClock

    private var state = RecordingState.idle
    private var observers: [UUID: AsyncStream<RecordingState>.Continuation] = [:]
    private var running: (hold: GateHold, writer: any RecordingWriter, written: AsyncStream<WrittenAudio>.Continuation)?

    public init(
        mic: any AudioCapture,
        callAudio: any AudioCapture,
        files: any RecordingFiles,
        calls: any NewCalls,
        recognition: any LiveRecognition,
        gate: ActivityGate,
        clock: any SessionClock
    ) {
        self.mic = mic
        self.callAudio = callAudio
        self.files = files
        self.calls = calls
        self.recognition = recognition
        self.gate = gate
        self.clock = clock
    }

    /// The current state at once, then every change.
    public func states() -> AsyncStream<RecordingState> {
        let (stream, continuation) = AsyncStream.makeStream(of: RecordingState.self)
        let id = UUID()
        observers[id] = continuation
        continuation.onTermination = { _ in Task { await self.removeObserver(id) } }
        continuation.yield(state)
        return stream
    }

    /// Starts recording a call titled `title` for `app`. While one records,
    /// it is returned and nothing changes.
    @discardableResult
    public func start(title: String, app: String) async throws(StartRefusal) -> Recording {
        if case .recording(let recording) = state { return recording }
        let hold: GateHold
        do {
            hold = try await gate.request(.recording)
        } catch {
            throw .moving
        }
        // A second start may have won while the gate was asked.
        if case .recording(let recording) = state {
            gate.release(hold)
            return recording
        }

        let details = CallDetails(start: clock.now, app: app, captured: Set(Track.allCases))
        let recording = Recording(call: details.id, title: title, start: details.start)
        // Failing to make the folder is recording-faults' to report.
        try? calls.create(title: title, details: details)

        let (written, continuation) = AsyncStream.makeStream(of: WrittenAudio.self)
        let writer = files.writer(for: recording.call)
        let origin = clock.uptime
        let tracks = Dictionary(uniqueKeysWithValues: Track.allCases.map {
            ($0, TrackRecorder(track: $0, origin: origin, writer: writer, written: continuation))
        })
        running = (hold, writer, continuation)
        mic.start(onAudio: tracks[.mic]!.record)
        callAudio.start(onAudio: tracks[.call]!.record)
        Task { [recognition] in await recognition.recognize(recording.call, written: written) }

        publish(.recording(recording))
        return recording
    }

    /// Ends recording without waiting for recognition: capture stops and
    /// the audio is sealed.
    public func stop() {
        guard let running else { return }
        self.running = nil
        mic.stop()
        callAudio.stop()
        running.writer.stop()
        running.written.finish()
        gate.release(running.hold)
        publish(.idle)
    }

    private func publish(_ new: RecordingState) {
        state = new
        for observer in observers.values { observer.yield(new) }
    }

    private func removeObserver(_ id: UUID) {
        observers[id] = nil
    }
}

/// Writes one track's captured audio as it comes, on the capture's own
/// thread, and reports it written. It never waits on anything else.
private final class TrackRecorder: @unchecked Sendable {
    private let track: Track
    private let origin: TimeInterval
    private let writer: any RecordingWriter
    private let written: AsyncStream<WrittenAudio>.Continuation
    private let lock = NSLock()
    private var end: TimeInterval?

    init(track: Track, origin: TimeInterval, writer: any RecordingWriter, written: AsyncStream<WrittenAudio>.Continuation) {
        self.track = track
        self.origin = origin
        self.writer = writer
        self.written = written
    }

    @Sendable func record(_ audio: CapturedAudio) {
        lock.lock()
        defer { lock.unlock() }
        do {
            if end == nil {
                try writer.startEpoch(1, of: track, at: audio.uptime - origin, sampleRate: audio.sampleRate)
            }
            try writer.write(audio.samples, to: track)
        } catch {
            // Disk failures are recording-faults'; unwritten audio is never reported.
            return
        }
        let end = audio.uptime - origin + Double(audio.samples.count) / audio.sampleRate
        self.end = end
        written.yield(WrittenAudio(track: track, epoch: 1, end: end))
    }
}
