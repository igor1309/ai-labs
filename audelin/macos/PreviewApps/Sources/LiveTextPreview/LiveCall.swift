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
            case .parakeet: try await ParakeetRecognizer()
            case .nemotron: try await NemotronRecognizer()
            case .twoPass: TwoPassRecognizer(draft: try await NemotronRecognizer(), final: try await ParakeetRecognizer())
            }
        }
    }

    enum Source: Hashable {

        case microphone
        case file(URL)
    }

    var model = Model.twoPass
    var source = Source.microphone
    var pause = 2.0
    private(set) var status = "Press Начать"
    private(set) var isRecording = false
    private(set) var transcript = Transcript()
    private(set) var started: ContinuousClock.Instant?
    var followsLive = true
    var holds: [PanelState.Held] = []

    private var lives: [LiveText] = []
    private var player: AVAudioPlayer?

    func state(at now: ContinuousClock.Instant) -> PanelState {

        guard isRecording || !transcript.entries.isEmpty else { return .init(recording: .off, log: .empty) }
        let elapsed = started.map { (now - $0).components.seconds } ?? 0
        let lines = PanelState.Lines(entries: transcript.entries, holds: holds, followsLive: followsLive)
        let recording: PanelState.Recording = isRecording
            ? .on(elapsed: String(format: "%02d:%02d:%02d", elapsed / 3600, elapsed / 60 % 60, elapsed % 60))
            : .off
        return .init(recording: recording, log: .lines(lines))
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

    func start() async {

        guard !isRecording else { return }
        transcript = Transcript()
        holds = []
        isRecording = true
        status = "Loading \(model.rawValue)…"

        do {
            let tracks: [(PanelState.Speaker, any AudioSource)]
            let startedAt = ContinuousClock.now
            switch source {
            case .microphone:
                tracks = [(.me, Microphone())]
            case let .file(url):
                let speakers: [PanelState.Speaker] = try RecordedTrack.channels(of: url) > 1 ? [.me, .them] : [.me]
                tracks = speakers.enumerated().map { ($1, RecordedTrack(url: url, channel: $0, started: startedAt)) }
            }
            var recognizers: [any Recognizer] = []
            for _ in tracks { recognizers.append(try await model.load()) }
            guard isRecording else { return }

            lives = recognizers.map { LiveText(recognizer: $0, pause: pause) }
            started = .now
            if case let .file(url) = source {
                player = try? AVAudioPlayer(contentsOf: url)
                player?.play()
            }
            status = "Listening with \(model.rawValue)"

            let showing = zip(tracks, lives).map { track, live in
                Task { for await segments in live.updates { show(track.0, segments) } }
            }
            await Self.listen(Array(zip(lives, tracks.map(\.1))))
            for task in showing { await task.value }
            status = "Finished"
        } catch {
            status = "Failed: \(error.localizedDescription)"
        }
        player?.stop()
        isRecording = false
    }

    func stop() {

        player?.stop()
        for live in lives { Task { await live.stop() } }
        if lives.isEmpty { isRecording = false }
    }

    private nonisolated static func listen(_ tracks: [(LiveText, any AudioSource)]) async {

        await withTaskGroup(of: Void.self) { group in
            for (live, audio) in tracks { group.addTask { await live.listen(to: audio) } }
        }
    }

    private func show(_ speaker: PanelState.Speaker, _ segments: Segments) {

        transcript.update(speaker, segments.all.map { .init(id: $0.id, start: $0.start, settled: $0.settled, pending: $0.pending) })
        if segments.ending == .failed { status = "The recogniser failed; the text so far is kept" }
    }
}
