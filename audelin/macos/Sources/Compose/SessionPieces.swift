import class CallAppProcesses.CallAppProcesses
import CallFolder
import CallText
import Foundation
import LiveText
import struct MicrophoneCapture.AudioPiece
import Session
import struct SystemAudioCapture.AudioPiece
import enum SystemAudioCapture.ProcessSelection
import TrackFile
import TranscriptFile

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

        case outOfOrder(String)
        case unknownFolder(String)
        case unknownSelection(String)
    }

    struct Hooks: Sendable {

        var executor: (any TaskExecutor)?

        var recordingTrack: @Sendable (SessionSide, TrackFile) -> any RecordingTrack = { _, track in
            CaptureTrack(track: track)
        }
        var beforeTranscriptFeed: @Sendable () async throws -> Void = {}
        var textStarted: @Sendable (CallText) async -> Void = { _ in }
        var closeTrack: @Sendable (SessionSide, TrackFile) async throws -> Void = { _, track in
            try await track.close()
        }
        var beforeAudioDelivery: @Sendable () async -> Void = {}
        var beforeTranscriptWrite: @Sendable (State) async throws -> Void = { _ in }
    }

    struct Side {

        let audio: DeferredAudio
        var track: TrackFile?
        var closed = false
        var captureAttempted = false
        var captureStarting = false
        var captureStopping = false
        var stopCapture: (@Sendable () async throws -> Void)?
    }

    /// Runtime failures from both sides, buffered as Session events.
    public nonisolated var events: AsyncStream<SessionEvent> { news.stream }

    let news = AsyncStream<SessionEvent>.makeStream()
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
    var transcriptClosed = false
    var text: CallText?
    var textStopped = false
    var textStopping = false
    var transcriptFeed: Task<Void, any Error>?

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
        sides = Dictionary(uniqueKeysWithValues: [SessionSide.microphone, .call].map { side in
            (side, Side(audio: DeferredAudio(beforeDelivery: hooks.beforeAudioDelivery)))
        })
    }

    public func create() throws -> SessionCallFolder {

        guard made == nil else { throw Failure.outOfOrder("folder already created") }
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
        guard sides[side]?.track == nil else { throw Failure.outOfOrder("\(side) track already opened") }
        sides[side]?.track = try TrackFile(url: side == .microphone ? made.microphoneURL : made.callURL)
    }

    func closeTrack(_ side: SessionSide) async throws {

        guard let destination = sides[side], let track = destination.track, !destination.closed else {
            throw Failure.outOfOrder("\(side) track is not open")
        }
        guard !destination.captureStarting, destination.stopCapture == nil else {
            throw Failure.outOfOrder("\(side) capture is still running")
        }
        sides[side]?.closed = true
        // Without a capture, closing the track is the audio source's end.
        defer { if !destination.captureAttempted { destination.audio.finish() } }
        try await hooks.closeTrack(side, track)
    }

    func openTranscript(in folder: SessionCallFolder) throws {

        let made = try places(in: folder)
        guard transcriptFile == nil else { throw Failure.outOfOrder("transcript already opened") }
        transcriptFile = try TranscriptFile(url: made.transcriptURL)
    }

    func closeTranscript() async throws {

        guard let transcriptFile, !transcriptClosed else { throw Failure.outOfOrder("transcript is not open") }
        guard text == nil || textStopped else { throw Failure.outOfOrder("call text is still running") }
        transcriptClosed = true
        defer { news.continuation.finish() }
        // Closing still releases the file when the feed reports a write failure.
        let result: Result<Void, any Error>?
        if let transcriptFeed { result = await transcriptFeed.result } else { result = nil }
        await transcriptFile.close()
        try result?.get()
    }

    public func start(enabled: Bool) async throws {

        guard text == nil else { throw Failure.outOfOrder("call text already started") }
        let microphone = try track(.microphone, recognizer: microphoneRecognizer)
        let call = try track(.call, recognizer: callRecognizer)
        guard let transcriptFile, !transcriptClosed else { throw Failure.outOfOrder("transcript is not open") }
        let text = CallText(microphone: microphone, call: call)
        self.text = text
        let beforeFeed = hooks.beforeTranscriptFeed
        let beforeWrite = hooks.beforeTranscriptWrite
        transcriptFeed = Task(executorPreference: hooks.executor) {
            try await beforeFeed()
            try await Transcript.feed(text.updates, to: transcriptFile, beforeWrite: beforeWrite)
        }
        await text.start(enabled: enabled)
        await hooks.textStarted(text)
    }

    public func setEnabled(_ enabled: Bool) async throws {

        guard let text, !textStopped, !textStopping else { throw Failure.outOfOrder("call text is not running") }
        await text.setEnabled(enabled)
    }

    public func stop() async throws {

        guard let text, !textStopped, !textStopping else { throw Failure.outOfOrder("call text is not running") }
        guard sides.values.allSatisfy({ !$0.captureStarting && $0.stopCapture == nil }) else {
            throw Failure.outOfOrder("capture is still running")
        }
        textStopping = true
        await text.stop()
        textStopped = true
    }

    private func track(_ side: SessionSide, recognizer: any Recognizer) throws -> CallSide {

        guard let destination = sides[side], let file = destination.track, !destination.closed else {
            throw Failure.outOfOrder("\(side) track is not open")
        }
        let adapter = TrackText(recognizer: recognizer, executor: hooks.executor)
        return CallSide(audio: destination.audio, text: adapter, written: WrittenTrack(track: file), sampleRate: TrackFile.sampleRate)
    }
}
