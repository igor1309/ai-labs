import class CallAppProcesses.CallAppProcesses
import CallFolder
import struct CallText.State
import Dispatch
import Foundation
import LiveAudio
import LiveText
import protocol RecordedCapture.Track
import struct MicrophoneCapture.AudioPiece
import Session
import struct SystemAudioCapture.AudioPiece
import enum SystemAudioCapture.ProcessSelection
import TrackFile
import TranscriptFile
import protocol TranscriptWriting.CallText

/// One started capture and the operation that ends its stream.
public struct StartedCapture<Piece: Sendable>: Sendable {

    public let stream: AsyncThrowingStream<Piece, any Error>
    public let stop: @Sendable () async throws -> Void

    public init(stream: AsyncThrowingStream<Piece, any Error>, stop: @escaping @Sendable () async throws -> Void) {

        self.stream = stream
        self.stop = stop
    }
}

/// Owns one recording's concrete pieces and exposes their distinct Session roles.
public actor SessionPieces: SessionModels, SessionFolder, SessionProcesses, SessionCallText {

    // Folder creation and synchronous file initializers perform blocking disk I/O.
    nonisolated let queue = DispatchSerialQueue(label: "audelin.SessionPieces")
    public nonisolated var unownedExecutor: UnownedSerialExecutor { queue.asUnownedSerialExecutor() }

    public enum Failure: Error, Equatable {

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
    public nonisolated var events: AsyncStream<SessionEvent> { news.stream }

    let news = AsyncStream<SessionEvent>.makeStream()
    nonisolated let transcriptFailures: TranscriptFailureReport
    let folder: CallFolder
    let folderTitle: String?
    let processes: CallAppProcesses
    let startMicrophone: @Sendable () async throws -> StartedCapture<MicrophoneCapture.AudioPiece>
    let startCall: @Sendable (SystemAudioCapture.ProcessSelection) async throws -> StartedCapture<SystemAudioCapture.AudioPiece>
    let microphoneRecognizerSource: @Sendable () async throws -> any Recognizer
    let callRecognizerSource: @Sendable () async throws -> any Recognizer
    let missingModels: @Sendable () -> [String]
    let monotonicNow: @Sendable () -> Double
    let timeOrigin: Double
    let captureLogSink: any LogSink
    let executor: (any TaskExecutor)?
    let openTrackFile: @Sendable (URL) async throws -> TrackFile
    let recordingTrack: @Sendable (SessionSide, TrackFile) -> any RecordedCapture.Track
    let closeTrackFile: @Sendable (SessionSide, TrackFile) async throws -> Void
    let makeCaptureAudio: @Sendable (SessionSide, LiveAudio) -> any CaptureAudio
    let openTranscriptFile: @Sendable (URL) async throws -> any SessionTranscriptFile
    let makeCallText: @Sendable (CallReader) -> any TranscriptWriting.CallText<State>
    var made: CallFolder.Made?
    var selections: [String: SystemAudioCapture.ProcessSelection] = [:]
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

    @usableFromInline
    static let defaultRecordingTrack: @Sendable (SessionSide, TrackFile) -> any RecordedCapture.Track = { _, track in CaptureTrack(track: track) }
    @usableFromInline
    static let defaultCloseTrack: @Sendable (SessionSide, TrackFile) async throws -> Void = { _, track in try await track.close() }
    @usableFromInline
    static let defaultMakeCaptureAudio: @Sendable (SessionSide, LiveAudio) -> any CaptureAudio = { _, capture in LiveCaptureAudio(capture: capture) }
    @usableFromInline
    static let defaultOpenTranscript: @Sendable (URL) async throws -> any SessionTranscriptFile = { try await WritingTranscript(file: TranscriptFile(url: $0)) }
    @usableFromInline
    static let defaultMakeCallText: @Sendable (CallReader) -> any TranscriptWriting.CallText<State> = { WritingCallText(text: $0) }

    @usableFromInline
    static let defaultMonotonicNow: @Sendable () -> Double = { Double(DispatchTime.now().uptimeNanoseconds) / 1_000_000_000 }

    public init(
        folder: CallFolder,
        folderTitle: String? = nil,
        processes: CallAppProcesses,
        startMicrophone: @escaping @Sendable () async throws -> StartedCapture<MicrophoneCapture.AudioPiece>,
        startCall: @escaping @Sendable (SystemAudioCapture.ProcessSelection) async throws -> StartedCapture<SystemAudioCapture.AudioPiece>,
        microphoneRecognizer: any Recognizer,
        callRecognizer: any Recognizer,
        missingModels: @escaping @Sendable () -> [String],
        monotonicNow: @escaping @Sendable () -> Double = SessionPieces.defaultMonotonicNow,
        executor: (any TaskExecutor)? = nil,
        openTrack: @escaping @Sendable (URL) async throws -> TrackFile = { try await TrackFile(url: $0) },
        recordingTrack: @escaping @Sendable (SessionSide, TrackFile) -> any RecordedCapture.Track = SessionPieces.defaultRecordingTrack,
        closeTrack: @escaping @Sendable (SessionSide, TrackFile) async throws -> Void = SessionPieces.defaultCloseTrack,
        makeCaptureAudio: @escaping @Sendable (SessionSide, LiveAudio) -> any CaptureAudio = SessionPieces.defaultMakeCaptureAudio,
        openTranscript: @escaping @Sendable (URL) async throws -> any SessionTranscriptFile = SessionPieces.defaultOpenTranscript,
        makeCallText: @escaping @Sendable (CallReader) -> any TranscriptWriting.CallText<State> = SessionPieces.defaultMakeCallText
    ) {

        self.init(
            folder: folder, folderTitle: folderTitle, processes: processes, startMicrophone: startMicrophone, startCall: startCall,
            microphoneRecognizerSource: { microphoneRecognizer }, callRecognizerSource: { callRecognizer },
            missingModels: missingModels, monotonicNow: monotonicNow,
            executor: executor, openTrack: openTrack, recordingTrack: recordingTrack, closeTrack: closeTrack,
            makeCaptureAudio: makeCaptureAudio, openTranscript: openTranscript, makeCallText: makeCallText,
            captureLogSink: SystemLogSink()
        )
    }

    public init(
        folder: CallFolder,
        folderTitle: String? = nil,
        processes: CallAppProcesses,
        startMicrophone: @escaping @Sendable () async throws -> StartedCapture<MicrophoneCapture.AudioPiece>,
        startCall: @escaping @Sendable (SystemAudioCapture.ProcessSelection) async throws -> StartedCapture<SystemAudioCapture.AudioPiece>,
        microphoneRecognizerSource: @escaping @Sendable () async throws -> any Recognizer,
        callRecognizerSource: @escaping @Sendable () async throws -> any Recognizer,
        missingModels: @escaping @Sendable () -> [String],
        monotonicNow: @escaping @Sendable () -> Double = SessionPieces.defaultMonotonicNow,
        executor: (any TaskExecutor)? = nil,
        openTrack: @escaping @Sendable (URL) async throws -> TrackFile = { try await TrackFile(url: $0) },
        recordingTrack: @escaping @Sendable (SessionSide, TrackFile) -> any RecordedCapture.Track = SessionPieces.defaultRecordingTrack,
        closeTrack: @escaping @Sendable (SessionSide, TrackFile) async throws -> Void = SessionPieces.defaultCloseTrack,
        makeCaptureAudio: @escaping @Sendable (SessionSide, LiveAudio) -> any CaptureAudio = SessionPieces.defaultMakeCaptureAudio,
        openTranscript: @escaping @Sendable (URL) async throws -> any SessionTranscriptFile = SessionPieces.defaultOpenTranscript,
        makeCallText: @escaping @Sendable (CallReader) -> any TranscriptWriting.CallText<State> = SessionPieces.defaultMakeCallText
    ) {

        self.init(
            folder: folder, folderTitle: folderTitle, processes: processes, startMicrophone: startMicrophone, startCall: startCall,
            microphoneRecognizerSource: microphoneRecognizerSource, callRecognizerSource: callRecognizerSource,
            missingModels: missingModels, monotonicNow: monotonicNow, executor: executor, openTrack: openTrack, recordingTrack: recordingTrack, closeTrack: closeTrack,
            makeCaptureAudio: makeCaptureAudio, openTranscript: openTranscript, makeCallText: makeCallText,
            captureLogSink: SystemLogSink()
        )
    }

    init(
        folder: CallFolder,
        folderTitle: String? = nil,
        processes: CallAppProcesses,
        startMicrophone: @escaping @Sendable () async throws -> StartedCapture<MicrophoneCapture.AudioPiece>,
        startCall: @escaping @Sendable (SystemAudioCapture.ProcessSelection) async throws -> StartedCapture<SystemAudioCapture.AudioPiece>,
        microphoneRecognizerSource: @escaping @Sendable () async throws -> any Recognizer,
        callRecognizerSource: @escaping @Sendable () async throws -> any Recognizer,
        missingModels: @escaping @Sendable () -> [String],
        monotonicNow: @escaping @Sendable () -> Double = SessionPieces.defaultMonotonicNow,
        executor: (any TaskExecutor)? = nil,
        openTrack: @escaping @Sendable (URL) async throws -> TrackFile = { try await TrackFile(url: $0) },
        recordingTrack: @escaping @Sendable (SessionSide, TrackFile) -> any RecordedCapture.Track = SessionPieces.defaultRecordingTrack,
        closeTrack: @escaping @Sendable (SessionSide, TrackFile) async throws -> Void = SessionPieces.defaultCloseTrack,
        makeCaptureAudio: @escaping @Sendable (SessionSide, LiveAudio) -> any CaptureAudio = SessionPieces.defaultMakeCaptureAudio,
        openTranscript: @escaping @Sendable (URL) async throws -> any SessionTranscriptFile = SessionPieces.defaultOpenTranscript,
        makeCallText: @escaping @Sendable (CallReader) -> any TranscriptWriting.CallText<State> = SessionPieces.defaultMakeCallText,
        captureLogSink: any LogSink
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
        self.captureLogSink = captureLogSink
        self.executor = executor
        self.openTrackFile = openTrack
        self.recordingTrack = recordingTrack
        self.closeTrackFile = closeTrack
        self.makeCaptureAudio = makeCaptureAudio
        self.openTranscriptFile = openTranscript
        self.makeCallText = makeCallText
        let continuation = news.continuation
        transcriptFailures = TranscriptFailureReport(deliver: { continuation.yield($0) })
        sides = Dictionary(uniqueKeysWithValues: [SessionSide.microphone, .call].map { side in
            (side, Side(audio: DeferredAudio()))
        })
    }

    // Checking the model files reads the disk, so it runs on this actor's queue.
    public func missing() -> [String] {

        missingModels()
    }

    public func create() throws -> SessionCallFolder {

        let made = try folder.make(title: folderTitle)
        self.made = made
        return SessionCallFolder(id: made.url.path)
    }

    public func select() async throws -> SessionProcessSelection {

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

    public func start(enabled: Bool) async throws {

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
            transcript: transcriptFile.map { TranscriptDestination(file: $0) },
            failureReport: transcriptFailures
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

    public func setEnabled(_ enabled: Bool) async throws {

        await writing?.setEnabled(enabled)
    }

    public func stop() async throws {

        await writing?.stop()
        await readingObservation?.value
    }

    private func track(_ side: SessionSide, recognizerSource: @escaping @Sendable () async throws -> any Recognizer) -> CallSide? {

        guard let destination = sides[side], let file = destination.track else { return nil }
        let adapter = TrackText(recognizerSource: recognizerSource, executor: executor)
        return CallSide(audio: destination.audio, text: adapter, written: WrittenTrack(track: file), sampleRate: TrackFile.sampleRate)
    }
}
