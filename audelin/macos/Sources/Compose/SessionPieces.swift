import class CallAppProcesses.CallAppProcesses
import CallFolder
import class CallText.CallText
import struct CallText.State
import Dispatch
import Foundation
import LiveText
import struct MicrophoneCapture.AudioPiece
import Session
import struct SystemAudioCapture.AudioPiece
import enum SystemAudioCapture.ProcessSelection
import TrackFile
import TranscriptFile
import class TranscriptWriting.TranscriptWriting

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

    // Folder creation and synchronous file initializers perform blocking disk I/O.
    nonisolated let queue = DispatchSerialQueue(label: "audelin.SessionPieces")
    public nonisolated var unownedExecutor: UnownedSerialExecutor { queue.asUnownedSerialExecutor() }

    public enum Failure: Error, Equatable {

        case unknownFolder(String)
        case unknownSelection(String)
        case unavailableTrack(SessionSide)
    }

    struct Hooks: Sendable {

        var executor: (any TaskExecutor)?

        var recordingTrack: @Sendable (SessionSide, TrackFile) -> any RecordingTrack = { _, track in
            CaptureTrack(track: track)
        }
        var textStarted: @Sendable (TranscriptWriting<State>) async -> Void = { _ in }
        var closeTrack: @Sendable (SessionSide, TrackFile) async throws -> Void = { _, track in
            try await track.close()
        }
        var beforeAudioDelivery: @Sendable () async -> Void = {}
        var openTranscript: @Sendable (URL) throws -> TranscriptFile = { try TranscriptFile(url: $0) }
        var beforeTranscriptWrite: @Sendable (State) async throws -> Void = { _ in }
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
    let hooks: Hooks
    var made: CallFolder.Made?
    var selections: [String: SystemAudioCapture.ProcessSelection] = [:]
    var sides: [SessionSide: Side]
    var transcriptFile: TranscriptFile?
    var text: CallText?
    var writing: TranscriptWriting<State>?

    public init(
        folder: CallFolder,
        processes: CallAppProcesses,
        startMicrophone: @escaping @Sendable () async throws -> StartedCapture<MicrophoneCapture.AudioPiece>,
        startCall: @escaping @Sendable (SystemAudioCapture.ProcessSelection) async throws -> StartedCapture<SystemAudioCapture.AudioPiece>,
        microphoneRecognizer: any Recognizer,
        callRecognizer: any Recognizer
    ) {

        self.init(
            folder: folder, processes: processes, startMicrophone: startMicrophone, startCall: startCall,
            microphoneRecognizer: microphoneRecognizer, callRecognizer: callRecognizer, hooks: Hooks()
        )
    }

    init(
        folder: CallFolder,
        processes: CallAppProcesses,
        startMicrophone: @escaping @Sendable () async throws -> StartedCapture<MicrophoneCapture.AudioPiece>,
        startCall: @escaping @Sendable (SystemAudioCapture.ProcessSelection) async throws -> StartedCapture<SystemAudioCapture.AudioPiece>,
        microphoneRecognizer: any Recognizer,
        callRecognizer: any Recognizer,
        hooks: Hooks
    ) {

        self.folder = folder
        self.processes = processes
        self.startMicrophone = startMicrophone
        self.startCall = startCall
        self.microphoneRecognizer = microphoneRecognizer
        self.callRecognizer = callRecognizer
        self.hooks = hooks
        let continuation = news.continuation
        transcriptFailures = TranscriptFailureReport(deliver: { continuation.yield($0) })
        sides = Dictionary(uniqueKeysWithValues: [SessionSide.microphone, .call].map { side in
            (side, Side(audio: DeferredAudio(beforeDelivery: hooks.beforeAudioDelivery)))
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
        sides[side]?.track = try TrackFile(url: side == .microphone ? made.microphoneURL : made.callURL)
    }

    func closeTrack(_ side: SessionSide) async throws {

        let destination = sides[side]!
        // Without a capture, closing the track is the audio source's end.
        defer { if !destination.audio.hasCapture { destination.audio.finish() } }
        if let track = destination.track { try await hooks.closeTrack(side, track) }
    }

    func openTranscript(in folder: SessionCallFolder) throws {

        let made = try places(in: folder)
        transcriptFile = try hooks.openTranscript(made.transcriptURL)
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
        let text = CallText(microphone: microphone, call: call)
        self.text = text
        let writing = TranscriptWriting(
            callText: WritingCallText(text: text),
            transcript: transcriptFile.map { WritingTranscript(file: $0, beforeWrite: hooks.beforeTranscriptWrite) },
            failureReport: transcriptFailures
        )
        self.writing = writing
        await writing.start(enabled: enabled)
        await hooks.textStarted(writing)
    }

    public func setEnabled(_ enabled: Bool) async throws {

        await writing?.setEnabled(enabled)
    }

    public func stop() async throws {

        await writing?.stop()
    }

    private func track(_ side: SessionSide, recognizer: any Recognizer) -> CallSide? {

        guard let destination = sides[side], let file = destination.track else { return nil }
        let adapter = TrackText(recognizer: recognizer, executor: hooks.executor)
        return CallSide(audio: destination.audio, text: adapter, written: WrittenTrack(track: file), sampleRate: TrackFile.sampleRate)
    }
}
