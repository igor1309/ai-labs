import class CallAppProcesses.CallAppProcesses
import CallFolder
import struct CallText.State
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
public actor SessionPieces: SessionFolder, SessionProcesses, SessionCallText {

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
    let processes: CallAppProcesses
    let startMicrophone: @Sendable () async throws -> StartedCapture<MicrophoneCapture.AudioPiece>
    let startCall: @Sendable (SystemAudioCapture.ProcessSelection) async throws -> StartedCapture<SystemAudioCapture.AudioPiece>
    let microphoneRecognizer: any Recognizer
    let callRecognizer: any Recognizer
    let executor: (any TaskExecutor)?
    let openTrackFile: @Sendable (URL) throws -> TrackFile
    let recordingTrack: @Sendable (SessionSide, TrackFile) -> any RecordedCapture.Track
    let closeTrackFile: @Sendable (SessionSide, TrackFile) async throws -> Void
    let makeCaptureAudio: @Sendable (SessionSide, LiveAudio) -> any CaptureAudio
    let openTranscriptFile: @Sendable (URL) throws -> any SessionTranscriptFile
    let makeCallText: @Sendable (CallReader) -> any TranscriptWriting.CallText<State>
    var made: CallFolder.Made?
    var selections: [String: SystemAudioCapture.ProcessSelection] = [:]
    var sides: [SessionSide: Side]
    var transcriptFile: (any SessionTranscriptFile)?
    var text: CallReader?
    var writing: WritingReader?

    public init(
        folder: CallFolder,
        processes: CallAppProcesses,
        startMicrophone: @escaping @Sendable () async throws -> StartedCapture<MicrophoneCapture.AudioPiece>,
        startCall: @escaping @Sendable (SystemAudioCapture.ProcessSelection) async throws -> StartedCapture<SystemAudioCapture.AudioPiece>,
        microphoneRecognizer: any Recognizer,
        callRecognizer: any Recognizer,
        executor: (any TaskExecutor)? = nil,
        openTrack: @escaping @Sendable (URL) throws -> TrackFile = { try TrackFile(url: $0) },
        recordingTrack: @escaping @Sendable (SessionSide, TrackFile) -> any RecordedCapture.Track = { _, track in CaptureTrack(track: track) },
        closeTrack: @escaping @Sendable (SessionSide, TrackFile) async throws -> Void = { (_: SessionSide, track: TrackFile) async throws in try await track.close() },
        makeCaptureAudio: @escaping @Sendable (SessionSide, LiveAudio) -> any CaptureAudio = { _, capture in LiveCaptureAudio(capture: capture) },
        openTranscript: @escaping @Sendable (URL) throws -> any SessionTranscriptFile = { try WritingTranscript(file: TranscriptFile(url: $0)) },
        makeCallText: @escaping @Sendable (CallReader) -> any TranscriptWriting.CallText<State> = { WritingCallText(text: $0) }
    ) {

        self.folder = folder
        self.processes = processes
        self.startMicrophone = startMicrophone
        self.startCall = startCall
        self.microphoneRecognizer = microphoneRecognizer
        self.callRecognizer = callRecognizer
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

    public func create() throws -> SessionCallFolder {

        let made = try folder.make()
        self.made = made
        return SessionCallFolder(id: made.url.path)
    }

    public func select() throws -> SessionProcessSelection {

        let selection = try processes.processes()
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

    func openTrack(_ side: SessionSide, in folder: SessionCallFolder) throws {

        let made = try places(in: folder)
        sides[side]?.track = try openTrackFile(side == .microphone ? made.microphoneURL : made.callURL)
    }

    func closeTrack(_ side: SessionSide) async throws {

        let destination = sides[side]!
        // Without a capture, closing the track is the audio source's end.
        defer { if !destination.audio.hasCapture { destination.audio.finish() } }
        if let track = destination.track { try await closeTrackFile(side, track) }
    }

    func openTranscript(in folder: SessionCallFolder) throws {

        let made = try places(in: folder)
        transcriptFile = try openTranscriptFile(made.transcriptURL)
    }

    func closeTranscript() async throws {

        defer { news.continuation.finish() }
        await transcriptFile?.close()
    }

    public func start(enabled: Bool) async throws {

        guard let microphone = track(.microphone, recognizer: microphoneRecognizer) else {
            throw Failure.unavailableTrack(.microphone)
        }
        guard let call = track(.call, recognizer: callRecognizer) else {
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
        await writing.start(enabled: enabled)
    }

    public func setEnabled(_ enabled: Bool) async throws {

        await writing?.setEnabled(enabled)
    }

    public func stop() async throws {

        await writing?.stop()
    }

    private func track(_ side: SessionSide, recognizer: any Recognizer) -> CallSide? {

        guard let destination = sides[side], let file = destination.track else { return nil }
        let adapter = TrackText(recognizer: recognizer, executor: executor)
        return CallSide(audio: destination.audio, text: adapter, written: WrittenTrack(track: file), sampleRate: TrackFile.sampleRate)
    }
}
