import AVFoundation
import LiveText
import NemotronRecognizer
import Observation
import PanelUI
import ParakeetRecognizer
import TwoPassRecognizer

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

    private var message = "Press Начать"
    private var loadingSince: ContinuousClock.Instant?
    private var lives: [LiveText] = []
    private var player: AVAudioPlayer?
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
        return .init(recording: recording, log: loadingSince != nil ? .preparing : .lines(lines))
    }

    func handle(_ event: PanelEvent) {

        switch event {
        case .start: Task { await start() }
        case .stop: stop()
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
            do { return try await model.load() } catch {
                Log.line("preparing \(model.rawValue) failed: \(error)")
                return nil
            }
        })
    }

    func start() async {

        guard !isRecording else { return }
        transcript = Transcript()
        holds = []
        lastLogged = [:]
        isRecording = true
        message = "Loading \(model.rawValue)…"
        loadingSince = .now
        Log.line("start: \(model.rawValue), source \(describe(source)), pause \(pause) s")

        do {
            // The audio starts now and waits for the models: a recorded track
            // is paced from now, and the microphone's chunks queue up.
            let tracks: [(PanelState.Speaker, any AudioSource)]
            let startedAt = ContinuousClock.now
            started = startedAt
            switch source {
            case .microphone:
                guard await Microphone.requestAccess() else {
                    throw Failure("No microphone access: allow the terminal in System Settings › Privacy & Security › Microphone")
                }
                tracks = [(.me, Started(Microphone().audio()))]
            case let .file(url):
                let channels = try RecordedTrack.channels(of: url)
                Log.line("recording: \(channels) channel(s)")
                let speakers: [PanelState.Speaker] = channels > 1 ? [.me, .them] : [.me]
                tracks = speakers.enumerated().map { ($1, RecordedTrack(url: url, channel: $0, started: startedAt)) }
                player = try? AVAudioPlayer(contentsOf: url)
                player?.play()
            }
            var recognizers: [any Recognizer] = []
            for _ in tracks { recognizers.append(try await recognizer()) }
            loadingSince = nil
            guard isRecording else {
                Log.line("stopped while loading")
                message = "Stopped"
                return
            }

            lives = recognizers.map { LiveText(recognizer: $0, pause: pause) }
            message = "Listening with \(model.rawValue)"
            Log.line("listening on \(tracks.count) track(s), catching up \(seconds(since: startedAt)) of audio")

            let showing = zip(tracks, lives).map { track, live in
                Task { for await segments in live.updates { show(track.0, segments) } }
            }
            await Self.listen(Array(zip(lives, tracks.map(\.1))))
            for task in showing { await task.value }
            if message.hasPrefix("Listening") { message = "Finished" }
            Log.line("finished")
        } catch {
            loadingSince = nil
            message = "Failed: \(error)"
            Log.line("failed: \(error)")
        }
        player?.stop()
        lives = []
        isRecording = false
        prepare()
    }

    func stop() {

        Log.line("stop")
        player?.stop()
        for live in lives { Task { await live.stop() } }
        if lives.isEmpty { isRecording = false }
    }

    /// The spare if it is the chosen model, else a fresh one.
    private func recognizer() async throws -> any Recognizer {

        if let spare, spare.model == model {
            self.spare = nil
            if let recognizer = await spare.loading.value { return recognizer }
        }
        return try await model.load()
    }

    private nonisolated static func listen(_ tracks: [(LiveText, any AudioSource)]) async {

        await withTaskGroup(of: Void.self) { group in
            for (live, audio) in tracks { group.addTask { await live.listen(to: audio) } }
        }
    }

    private func show(_ speaker: PanelState.Speaker, _ segments: Segments) {

        transcript.update(speaker, segments.all.map { .init(id: $0.id, start: $0.start, settled: $0.settled, pending: $0.pending) })
        if segments.ending == .failed { message = "The recogniser failed; the text so far is kept" }

        let now = ContinuousClock.now
        guard segments.ending != nil || lastLogged[speaker].map({ now - $0 >= .seconds(5) }) ?? true else { return }
        lastLogged[speaker] = now
        let settled = segments.all.reduce(0) { $0 + $1.settled.split(separator: " ").count }
        let pending = segments.all.reduce(0) { $0 + $1.pending.split(separator: " ").count }
        let ending = segments.ending.map { ", \($0)" } ?? ""
        Log.line("\(speaker == .me ? "я" : "они"): \(segments.all.count) segment(s), \(settled) settled, \(pending) pending word(s)\(ending)")
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
