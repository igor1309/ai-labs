import class SavePacing.SavePacing
import class CallAppProcesses.CallAppProcesses
import CallFolder
import Foundation
import Session
import TrackFile
import TranscriptFile

/// Owns one recording's concrete pieces and exposes their distinct Session roles.
actor SessionPieces: SessionModels, SessionFolder, SessionProcesses, SessionCallText {

    enum Failure: Error, Equatable {

        case unknownFolder(String)
        case unknownSelection(String)
        case unavailableTrack(SessionSide)
    }

    struct Side {

        let audio: DeferredAudio
        var track: (any AudioRecording)?
        var stopCapture: (@Sendable () async throws -> Void)?
    }

    /// Runtime failures, with transcript failures sent directly when a Session is connected.
    nonisolated var events: AsyncStream<SessionEvent> { news.stream }

    let news = AsyncStream<SessionEvent>.makeStream()
    nonisolated let transcriptFailures: TranscriptFailureReport
    let cleanupRuns: CleanupRuns
    let summaries: SummaryCallbacks
    let folder: CallFolder
    let folderTitle: String?
    let processes: CallAppProcesses
    let boundary: ComposerBoundary
    let timeOrigin: Double
    var made: CallFolder.Made?
    var selections: [String: CaptureSelection] = [:]
    var sides: [SessionSide: Side]
    var transcriptFile: (any SessionTranscriptFile)?
    var writing: WritingReader?
    private var readingOutput: NewestText?
    private var readingSpeakers: AsyncStream<[Int: Int]>.Continuation?
    private var readingObservation: Task<Void, Never>?

    // Register before Session begins so its first text state cannot be missed.
    func readingText() -> (text: AsyncStream<CallState>, speakers: AsyncStream<[Int: Int]>) {

        let output = NewestText()
        readingOutput = output
        let speakers = AsyncStream<[Int: Int]>.makeStream()
        readingSpeakers = speakers.continuation
        return (output.stream, speakers.stream)
    }

    /// Ends the reading feed once the session has ended, whether or not its transcript opened.
    func finishReading() {

        readingOutput?.finish()
        readingSpeakers?.finish()
    }

    /// A long call's transcript is saved at most this often, and at once when its text stops.
    static let transcriptInterval: Duration = .seconds(5)

    init(folder: CallFolder, folderTitle: String?, processes: CallAppProcesses, boundary: ComposerBoundary, cleanupRuns: CleanupRuns, summaries: SummaryCallbacks = .disabled) {
        self.cleanupRuns = cleanupRuns
        self.summaries = summaries
        self.folder = folder
        self.folderTitle = folderTitle
        self.processes = processes
        self.boundary = boundary
        self.timeOrigin = boundary.time.monotonicNow()
        let continuation = news.continuation
        transcriptFailures = TranscriptFailureReport(deliver: { continuation.yield($0) })
        sides = Dictionary(uniqueKeysWithValues: [SessionSide.microphone, .call].map { side in
            (side, Side(audio: DeferredAudio()))
        })
    }

    // Checking the model files reads the disk, so it runs on this actor's queue.
    func missing() -> [String] {
        boundary.recognizers.missingModels()
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
        sides[side]?.track = try await boundary.recordings.open(at: side == .microphone ? made.microphoneURL : made.callURL)
    }

    func closeTrack(_ side: SessionSide) async throws {

        let destination = sides[side]!
        // Without a capture, closing the track is the audio source's end.
        defer { if !destination.audio.hasCapture { destination.audio.finish() } }
        if let track = destination.track { try await track.close() }
    }

    func openTranscript(in folder: SessionCallFolder) async throws {

        let made = try places(in: folder)
        LiveNameBoard.shared.callTrack(made.callURL)
        let file = try await boundary.transcripts.open(at: made.transcriptURL, sink: boundary.log)
        transcriptFile = SummaryTranscript(base: file, folder: made.url, callbacks: summaries, cleanup: TranscriptCleanup(
            recording: CleanupRecording(microphoneURL: made.microphoneURL, callURL: made.callURL),
            duration: { [microphone = sides[.microphone]!.audio, call = sides[.call]!.audio] in
                max(microphone.capturedThrough, call.capturedThrough)
            }, cleaning: boundary.bleedCleaning, hearing: boundary.bleedHearing, sink: boundary.log
        ), runs: cleanupRuns)
    }

    func closeTranscript() async throws {

        defer { news.continuation.finish(); readingOutput?.finish(); readingSpeakers?.finish() }
        await transcriptFile?.close()
        // The pass ran inside close; the reading model takes each row's speaker after the text.
        if let places = await transcriptFile?.attributeSpeakers()?.rows, !places.isEmpty {
            readingSpeakers?.yield(places)
        }
    }

    func start(enabled: Bool) async throws {

        guard let microphone = track(.microphone, side: .microphone) else {
            throw Failure.unavailableTrack(.microphone)
        }
        guard let call = track(.call, side: .call) else {
            throw Failure.unavailableTrack(.call)
        }
        let text = CallReader(microphone: microphone, call: call)
        let writing = WritingReader(
            callText: WritingCallText(text: text),
            saving: transcriptFile.map {
                PacedTextSaving(pacing: SavePacing(
                    saving: TranscriptDestination(file: SignpostedTranscriptFile(base: $0, intervals: boundary.intervals)),
                    failureReport: transcriptFailures,
                    pause: { [boundary] in try await boundary.time.sleep(SessionPieces.transcriptInterval) }
                ))
            }
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

        if let made { await summaries.waiting(made.url) }
        await writing?.stop()
        await readingObservation?.value
    }

    private func track(_ sessionSide: SessionSide, side: ComposerSide) -> CallSide? {

        guard let destination = sides[sessionSide], let file = destination.track else { return nil }
        let boundary = boundary
        let adapter = TrackText(recognizerSource: { SignpostedRecognizer(base: BoundaryRecognizer(base: try await boundary.recognizers.recognizer(for: side)), intervals: boundary.intervals) })
        // A transient capture writes nothing, so its track would never cover what fill-in reads.
        let written = boundary.capturePersistence == .recorded ? WrittenTrack(track: file) : nil
        return CallSide(audio: destination.audio, text: adapter, written: written, sampleRate: TrackFile.sampleRate)
    }
}
