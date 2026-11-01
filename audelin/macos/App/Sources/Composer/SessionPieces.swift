import class CallAppProcesses.CallAppProcesses
import CallFolder
import struct CallText.State
import Dispatch
import Foundation
import LiveAudio
import LiveText
import protocol RecordedCapture.Track
import Session
import TrackFile
import TranscriptFile
import protocol TranscriptWriting.CallText

/// Owns one recording's concrete pieces and exposes their distinct Session roles.
actor SessionPieces: SessionModels, SessionFolder, SessionProcesses, SessionCallText {

    // Folder creation and synchronous file initializers perform blocking disk I/O.
    private nonisolated let queue = DispatchSerialQueue(label: "audelin.SessionPieces")
    nonisolated var unownedExecutor: UnownedSerialExecutor { queue.asUnownedSerialExecutor() }

    enum Failure: Error, Equatable {

        case unknownFolder(String)
        case unknownSelection(String)
        case unavailableTrack(SessionSide)
    }

    struct Side {

        let audio: DeferredAudio
        var track: TrackFile?
        var stopCapture: (@Sendable () async throws -> Void)?
    }

    /// Runtime failures, with transcript failures sent directly when a Session is connected.
    nonisolated var events: AsyncStream<SessionEvent> { news.stream }

    let news = AsyncStream<SessionEvent>.makeStream()
    nonisolated let transcriptFailures: TranscriptFailureReport
    let folder: CallFolder
    let folderTitle: String?
    let processes: CallAppProcesses
    let startMicrophone: @Sendable () async throws -> StartedCapture<CaptureBuffer>
    let startCall: @Sendable (CaptureSelection) async throws -> StartedCapture<CaptureBuffer>
    let microphoneRecognizerSource: @Sendable () async throws -> any Recognizer
    let callRecognizerSource: @Sendable () async throws -> any Recognizer
    let missingModels: @Sendable () -> [String]
    let monotonicNow: @Sendable () -> Double
    let timeOrigin: Double
    let intervals: ProfileIntervals
    let captureLogSink: any LogSink
    let openTrackFile: @Sendable (URL) async throws -> TrackFile
    let recordingTrack: @Sendable (SessionSide, TrackFile) -> any RecordedCapture.Track
    let closeTrackFile: @Sendable (SessionSide, TrackFile) async throws -> Void
    let makeCaptureAudio: @Sendable (SessionSide, LiveAudio) -> any CaptureAudio
    let openTranscriptFile: @Sendable (URL) async throws -> any SessionTranscriptFile
    let makeCallText: @Sendable (CallReader) -> any TranscriptWriting.CallText<State>
    let sleep: @Sendable (Duration) async throws -> Void
    var made: CallFolder.Made?
    var selections: [String: CaptureSelection] = [:]
    var sides: [SessionSide: Side]
    var transcriptFile: (any SessionTranscriptFile)?
    var text: CallReader?
    var writing: WritingReader?
    private var readingOutput: NewestText?
    private var readingObservation: Task<Void, Never>?

    // Register before Session begins so its first text state cannot be missed.
    func readingText() -> AsyncStream<State> {

        let output = NewestText()
        readingOutput = output
        return output.stream
    }

    static let defaultRecordingTrack: @Sendable (SessionSide, TrackFile) -> any RecordedCapture.Track = { _, track in CaptureTrack(track: track) }
    static let defaultCloseTrack: @Sendable (SessionSide, TrackFile) async throws -> Void = { _, track in try await track.close() }
    static let defaultMakeCaptureAudio: @Sendable (SessionSide, LiveAudio) -> any CaptureAudio = { _, capture in LiveCaptureAudio(capture: capture) }
    static let defaultOpenTranscript: @Sendable (URL) async throws -> any SessionTranscriptFile = { try await WritingTranscript(file: TranscriptFile(url: $0)) }
    static let defaultMakeCallText: @Sendable (CallReader) -> any TranscriptWriting.CallText<State> = { WritingCallText(text: $0) }

    /// A long call's transcript is saved at most this often, and at once when its text stops,
    /// so the disk is not rewritten on every word (owner, 2026-10-31,
    /// `docs/research/transcript-save-interval.md`).
    static let transcriptInterval: Duration = .seconds(5)

    init(
        folder: CallFolder,
        folderTitle: String? = nil,
        processes: CallAppProcesses,
        startMicrophone: @escaping @Sendable () async throws -> StartedCapture<CaptureBuffer>,
        startCall: @escaping @Sendable (CaptureSelection) async throws -> StartedCapture<CaptureBuffer>,
        microphoneRecognizerSource: @escaping @Sendable () async throws -> any Recognizer,
        callRecognizerSource: @escaping @Sendable () async throws -> any Recognizer,
        missingModels: @escaping @Sendable () -> [String],
        monotonicNow: @escaping @Sendable () -> Double,
        openTrack: @escaping @Sendable (URL) async throws -> TrackFile = { try await TrackFile(url: $0) },
        recordingTrack: @escaping @Sendable (SessionSide, TrackFile) -> any RecordedCapture.Track = SessionPieces.defaultRecordingTrack,
        closeTrack: @escaping @Sendable (SessionSide, TrackFile) async throws -> Void = SessionPieces.defaultCloseTrack,
        makeCaptureAudio: @escaping @Sendable (SessionSide, LiveAudio) -> any CaptureAudio = SessionPieces.defaultMakeCaptureAudio,
        openTranscript: @escaping @Sendable (URL) async throws -> any SessionTranscriptFile = SessionPieces.defaultOpenTranscript,
        makeCallText: @escaping @Sendable (CallReader) -> any TranscriptWriting.CallText<State> = SessionPieces.defaultMakeCallText,
        captureLogSink: any LogSink,
        intervals: ProfileIntervals,
        sleep: @escaping @Sendable (Duration) async throws -> Void
    ) {

        self.folder = folder
        self.folderTitle = folderTitle
        self.processes = processes
        self.startMicrophone = startMicrophone
        self.startCall = startCall
        self.microphoneRecognizerSource = microphoneRecognizerSource
        self.callRecognizerSource = callRecognizerSource
        self.monotonicNow = monotonicNow
        self.timeOrigin = monotonicNow()
        self.missingModels = missingModels
        self.intervals = intervals
        self.captureLogSink = captureLogSink
        self.openTrackFile = openTrack
        self.recordingTrack = recordingTrack
        self.closeTrackFile = closeTrack
        self.makeCaptureAudio = makeCaptureAudio
        self.openTranscriptFile = openTranscript
        self.makeCallText = makeCallText
        self.sleep = sleep
        let continuation = news.continuation
        transcriptFailures = TranscriptFailureReport(deliver: { continuation.yield($0) })
        sides = Dictionary(uniqueKeysWithValues: [SessionSide.microphone, .call].map { side in
            (side, Side(audio: DeferredAudio()))
        })
    }

    // Checking the model files reads the disk, so it runs on this actor's queue.
    func missing() -> [String] {

        missingModels()
    }

    func create() throws -> SessionCallFolder {

        let made = try folder.make(title: folderTitle)
        self.made = made
        return SessionCallFolder(id: made.url.path)
    }

    func select() async throws -> SessionProcessSelection {

        let selection = try await processes.processes()
        let id = UUID().uuidString
        selections[id] = switch selection {
        case let .only(pids): .only(pids)
        case let .allExcept(pids): .allExcept(pids)
        }
        return SessionProcessSelection(id: id)
    }

    func places(in folder: SessionCallFolder) throws -> CallFolder.Made {

        guard let made, made.url.path == folder.id else { throw Failure.unknownFolder(folder.id) }
        return made
    }

    func openTrack(_ side: SessionSide, in folder: SessionCallFolder) async throws {

        let made = try places(in: folder)
        sides[side]?.track = try await openTrackFile(side == .microphone ? made.microphoneURL : made.callURL)
    }

    func closeTrack(_ side: SessionSide) async throws {

        let destination = sides[side]!
        // Without a capture, closing the track is the audio source's end.
        defer { if !destination.audio.hasCapture { destination.audio.finish() } }
        if let track = destination.track { try await closeTrackFile(side, track) }
    }

    func openTranscript(in folder: SessionCallFolder) async throws {

        let made = try places(in: folder)
        transcriptFile = try await openTranscriptFile(made.transcriptURL)
    }

    func closeTranscript() async throws {

        defer { news.continuation.finish(); readingOutput?.finish() }
        await transcriptFile?.close()
    }

    func start(enabled: Bool) async throws {

        guard let microphone = track(.microphone, recognizerSource: microphoneRecognizerSource) else {
            throw Failure.unavailableTrack(.microphone)
        }
        guard let call = track(.call, recognizerSource: callRecognizerSource) else {
            throw Failure.unavailableTrack(.call)
        }
        let text = CallReader(microphone: microphone, call: call)
        self.text = text
        let writing = WritingReader(
            callText: makeCallText(text),
            transcript: transcriptFile.map { TranscriptDestination(file: SignpostedTranscriptFile(base: $0, intervals: intervals)) },
            failureReport: transcriptFailures,
            pause: { [sleep] in try await sleep(SessionPieces.transcriptInterval) }
        )
        self.writing = writing
        if let output = readingOutput {
            readingObservation = Task {
                for await state in writing.updates.removingRepeats() { output.yield(state) }
                output.finish()
            }
        }
        await writing.start(enabled: enabled)
    }

    func setEnabled(_ enabled: Bool) async throws {

        await writing?.setEnabled(enabled)
    }

    func stop() async throws {

        await writing?.stop()
        await readingObservation?.value
    }

    private func track(_ side: SessionSide, recognizerSource: @escaping @Sendable () async throws -> any Recognizer) -> CallSide? {

        guard let destination = sides[side], let file = destination.track else { return nil }
        let intervals = intervals
        let adapter = TrackText(recognizerSource: { SignpostedRecognizer(base: try await recognizerSource(), intervals: intervals) })
        return CallSide(audio: destination.audio, text: adapter, written: WrittenTrack(track: file), sampleRate: TrackFile.sampleRate)
    }
}
