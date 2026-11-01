import AVFoundation
import LiveText
import NemotronRecognizer
import Observation
import PanelUI
import ParakeetRecognizer
import TwoPassRecognizer

@MainActor
protocol AudioPlayer {

    @discardableResult func play() -> Bool
    func stop()
}

extension AVAudioPlayer: AudioPlayer {}

/// A call heard by the real recognisers and Live text: the microphone as
/// «я», or a recorded file, its left channel «я» and its right «они».
@MainActor
@Observable
final class LiveCall {

    enum Model: String, CaseIterable, Identifiable {

        case parakeet = "Parakeet"
        case nemotron = "Nemotron"
        case twoPass = "Two-pass"

        var id: Self { self }

        func load() async throws -> any Recognizer {

            switch self {
            case .parakeet: try await timed("Parakeet") { try await ParakeetRecognizer() }
            case .nemotron: try await timed("Nemotron") { try await NemotronRecognizer() }
            case .twoPass:
                TwoPassRecognizer(
                    draft: try await timed("Nemotron") { try await NemotronRecognizer() },
                    final: try await timed("Parakeet") { try await ParakeetRecognizer() }
                )
            }
        }

        private func timed(_ name: String, _ load: () async throws -> any Recognizer) async throws -> any Recognizer {

            let started = ContinuousClock.now
            Log.line("loading \(name)")
            let recognizer = try await load()
            Log.line("loaded \(name) in \(seconds(since: started))")
            return recognizer
        }
    }

    enum Source: Hashable {

        case microphone
        case file(URL)
    }

    var model = Model.twoPass
    var source = Source.microphone
    var pause = 2.0
    private(set) var isRecording = false
    private(set) var transcript = Transcript()
    private(set) var started: ContinuousClock.Instant?
    var followsLive = true
    var holds: [PanelState.Held] = []

    struct Audio {

        var tracks: [(PanelState.Speaker, any AudioSource)]
        var stop: () -> Void
    }

    private let load: @MainActor (Model) async throws -> any Recognizer
    private let beginAudio: @MainActor (Source, ContinuousClock.Instant) async throws -> Audio
    private let now: @MainActor () -> ContinuousClock.Instant

    init(
        load: @escaping @MainActor (Model) async throws -> any Recognizer = { try await $0.load() },
        beginAudio: @escaping @MainActor (Source, ContinuousClock.Instant) async throws -> Audio = { try await LiveCall.beginAudio($0, $1) },
        now: @escaping @MainActor () -> ContinuousClock.Instant = { .now }
    ) {

        self.load = load
        self.beginAudio = beginAudio
        self.now = now
    }

    private var message = "Press Начать"
    private var loadingSince: ContinuousClock.Instant?
    private final class Session {

        let model: Model
        let pause: Double
        var audio: Audio?
        var lives: [LiveText] = []
        var stopped = false

        init(model: Model, pause: Double) {

            self.model = model
            self.pause = pause
        }

        func stopAudio() {

            audio?.stop()
            audio = nil
        }
    }

    private var session: Session?
    /// A recogniser loaded ahead, for the next start's first track.
    private var spare: (model: Model, loading: Task<(any Recognizer)?, Never>)?
    private var lastLogged: [PanelState.Speaker: ContinuousClock.Instant] = [:]

    func status(at now: ContinuousClock.Instant) -> String {

        guard let loadingSince else { return message }
        return "\(message) \(Int((now - loadingSince).components.seconds)) s; the first load compiles the models, about 30 s"
    }

    func state(at now: ContinuousClock.Instant) -> PanelState {

        guard isRecording || !transcript.entries.isEmpty else { return .init(recording: .off, log: .empty) }
        let elapsed = started.map { (now - $0).components.seconds } ?? 0
        let lines = PanelState.Lines(entries: transcript.entries, holds: holds, followsLive: followsLive)
        let recording: PanelState.Recording = isRecording
            ? .on(elapsed: String(format: "%02d:%02d:%02d", elapsed / 3600, elapsed / 60 % 60, elapsed % 60))
            : .off
        return .init(recording: recording, log: loadingSince != nil ? .preparing(holds: lines.holds) : .lines(lines))
    }

    func handle(_ event: PanelEvent) {

        switch event {
        case .start: Task { await start() }
        case .stop: stop()
        case .openSettings, .openCallsFolder: break
        case .switchLiveTextOn: break
        case let .hold(held): holds.append(held)
        case let .letGo(held): holds.removeAll { $0 == held }
        case let .scrolled(atBottom): followsLive = atBottom
        case .jumpToLive: followsLive = true
        }
    }

    /// Loads the chosen model ahead of a start, unless one is loaded or
    /// loading already.
    func prepare() {

        guard !isRecording, spare?.model != model else { return }
        let model = model
        Log.line("preparing \(model.rawValue) ahead of a start")
        spare = (model, Task {
            do { return try await load(model) } catch {
                Log.line("preparing \(model.rawValue) failed: \(error)")
                return nil
            }
        })
    }

    func start() async {

        guard !isRecording else { return }
        let session = Session(model: model, pause: pause)
        self.session = session
        let source = source
        let startedAt = now()
        started = startedAt
        transcript = Transcript()
        holds = []
        lastLogged = [:]
        isRecording = true
        message = "Loading \(session.model.rawValue)…"
        loadingSince = startedAt
        Log.line("start: \(session.model.rawValue), source \(describe(source)), pause \(session.pause) s")

        do {
            // Audio and playback use the clock's origin, before loading;
            // queued audio lets live text catch up when the models are ready.
            let audio = try await beginAudio(source, startedAt)
            guard self.session === session, !session.stopped else {
                audio.stop()
                return
            }
            session.audio = audio
            let tracks = audio.tracks
            var recognizers: [any Recognizer] = []
            for _ in tracks {
                recognizers.append(try await recognizer(for: session))
                guard self.session === session, !session.stopped else { return }
            }
            loadingSince = nil

            let lives = recognizers.map { LiveText(recognizer: $0, pause: session.pause) }
            session.lives = lives
            message = "Listening with \(session.model.rawValue)"
            Log.line("listening on \(tracks.count) track(s), catching up \(seconds(since: startedAt)) of audio")

            let showing = zip(tracks, lives).map { track, live in
                Task {
                    var all: [Segments.Segment] = []
                    for await segments in live.updates {
                        guard self.session === session else { continue }
                        all.replaceSubrange(segments.from..., with: segments.segments)
                        show(track.0, all, ending: segments.ending)
                    }
                }
            }
            await Self.listen(Array(zip(lives, tracks.map(\.1))))
            for task in showing { await task.value }
            guard self.session === session else { return }
            if message.hasPrefix("Listening") { message = "Finished" }
            Log.line("finished")
        } catch {
            guard self.session === session, !session.stopped else { return }
            loadingSince = nil
            message = "Failed: \(error)"
            Log.line("failed: \(error)")
        }
        session.stopAudio()
        session.lives = []
        self.session = nil
        isRecording = false
        prepare()
    }

    func stop() {

        guard let session else { return }
        Log.line("stop")
        session.stopped = true
        session.stopAudio()
        for live in session.lives { Task { await live.stop() } }
        if session.lives.isEmpty {
            self.session = nil
            isRecording = false
            loadingSince = nil
            message = "Stopped"
        }
    }

    /// The prepared recogniser belongs to the start that takes it.
    private func recognizer(for session: Session) async throws -> any Recognizer {

        if let spare, spare.model == session.model {
            self.spare = nil
            let recognizer = await spare.loading.value
            guard self.session === session, !session.stopped else { throw CancellationError() }
            if let recognizer { return recognizer }
        }
        return try await load(session.model)
    }

    static func beginAudio(
        _ source: Source,
        _ startedAt: ContinuousClock.Instant,
        makeTrack: (URL, Int, ContinuousClock.Instant) -> any AudioSource = { RecordedTrack(url: $0, channel: $1, started: $2) },
        makePlayer: (URL) throws -> any AudioPlayer = { try AVAudioPlayer(contentsOf: $0) }
    ) async throws -> Audio {

        switch source {
        case .microphone:
            guard await Microphone.requestAccess() else {
                throw Failure("No microphone access: allow the terminal in System Settings › Privacy & Security › Microphone")
            }
            let microphone = Microphone(source: EngineMicrophoneSource())
            let stream = microphone.audio()
            return Audio(tracks: [(.me, Started(stream))], stop: { microphone.end() })
        case let .file(url):
            let channels = try RecordedTrack.channels(of: url)
            Log.line("recording: \(channels) channel(s)")
            let speakers: [PanelState.Speaker] = channels > 1 ? [.me, .them] : [.me]
            let tracks = speakers.enumerated().map { ($1, makeTrack(url, $0, startedAt)) }
            let player = try? makePlayer(url)
            player?.play()
            return Audio(tracks: tracks, stop: { player?.stop() })
        }
    }

    private nonisolated static func listen(_ tracks: [(LiveText, any AudioSource)]) async {

        await withTaskGroup(of: Void.self) { group in
            for (live, audio) in tracks { group.addTask { await live.listen(to: audio) } }
        }
    }

    private func show(_ speaker: PanelState.Speaker, _ segments: [Segments.Segment], ending: Segments.Ending?) {

        transcript.update(speaker, segments.map { .init(id: $0.id, start: $0.start, settled: $0.settled, pending: $0.pending) })
        if ending == .failed { message = "The recogniser failed; the text so far is kept" }

        let now = ContinuousClock.now
        guard ending != nil || lastLogged[speaker].map({ now - $0 >= .seconds(5) }) ?? true else { return }
        lastLogged[speaker] = now
        let settled = segments.reduce(0) { $0 + $1.settled.split(separator: " ").count }
        let pending = segments.reduce(0) { $0 + $1.pending.split(separator: " ").count }
        let ending = ending.map { ", \($0)" } ?? ""
        Log.line("\(speaker == .me ? "я" : "они"): \(segments.count) segment(s), \(settled) settled, \(pending) pending word(s)\(ending)")
    }

    private func describe(_ source: Source) -> String {

        switch source {
        case .microphone: "microphone"
        case let .file(url): url.lastPathComponent
        }
    }

    private struct Failure: Error, CustomStringConvertible {

        let description: String

        init(_ description: String) { self.description = description }
    }
}

private func seconds(since start: ContinuousClock.Instant) -> String {

    let elapsed = (ContinuousClock.now - start).components
    return String(format: "%.1f s", Double(elapsed.seconds) + Double(elapsed.attoseconds) / 1e18)
}
