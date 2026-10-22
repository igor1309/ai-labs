import AVFoundation
import Foundation
import LiveText
import PanelUI
import Synchronization
import Testing
@testable import LiveTextPreview

@MainActor
struct LiveCallTests {

    @Test(arguments: [1, 2])
    func fileAudioStartsTracksAndPlaybackBeforeModelsLoad(channels: Int) async throws {

        let url = try recording(channels: channels)
        defer { try? FileManager.default.removeItem(at: url) }
        let loader = Loader(held: 1)
        let player = PlayerSpy()
        let pressed = ContinuousClock.now - .seconds(42)
        var tracks: [(url: URL, channel: Int, started: ContinuousClock.Instant, audio: AudioSpy)] = []
        var playerURLs: [URL] = []
        let call = LiveCall(load: loader.load, beginAudio: { source, started in
            try await LiveCall.beginAudio(source, started, makeTrack: { url, channel, instant in
                let audio = AudioSpy(ended: true)
                tracks.append((url, channel, instant, audio))
                return audio
            }, makePlayer: { url in
                playerURLs.append(url)
                return player
            })
        }, now: { pressed })
        call.source = .file(url)
        let starting = Task { await call.start() }
        await loader.next()

        #expect(call.started == pressed)
        #expect(call.isRecording)
        #expect(tracks.map(\.url) == Array(repeating: url, count: channels))
        #expect(tracks.map(\.channel) == Array(0..<channels))
        #expect(tracks.map(\.started) == Array(repeating: pressed, count: channels))
        #expect(tracks.allSatisfy { $0.started == call.started })
        #expect(tracks.allSatisfy { $0.audio.listens == 0 })
        #expect(playerURLs == [url])
        #expect(player.plays == 1)
        #expect(player.stops == 0)

        call.stop()
        loader.release(0)
        await starting.value
        #expect(player.stops == 1)
        #expect(!call.isRecording)
    }

    @Test func stoppingDuringAudioSetupStopsItsAudioWithoutLoadingAModel() async {

        let loader = Loader(held: 0)
        let audio = AudioSpy(ended: true)
        let setup = AudioSetup(audio: audio)
        let call = LiveCall(load: loader.load, beginAudio: { _, _ in await setup.begin() })
        let starting = Task { await call.start() }
        await setup.next()
        call.stop()
        let observedAt = ContinuousClock.now
        let status = call.status(at: observedAt)

        setup.release()
        await starting.value

        #expect(audio.stops == 1)
        #expect(audio.listens == 0)
        #expect(loader.models.isEmpty)
        #expect(!call.isRecording)
        #expect(call.status(at: observedAt) == status)
        #expect(call.transcript.entries.isEmpty)
        call.stop()
        #expect(audio.stops == 1)
    }

    @Test func aStoppedAudioSetupCannotChangeTheNextSession() async {

        let loader = Loader(held: 1)
        let oldAudio = AudioSpy(ended: true)
        let currentAudio = AudioSpy(ended: false)
        let setup = AudioSetup(audio: oldAudio)
        var setups = 0
        var now = ContinuousClock.now
        let call = LiveCall(load: loader.load, beginAudio: { _, _ in
            setups += 1
            if setups == 1 { return await setup.begin() }
            return currentAudio.begin()
        }, now: { now })
        call.model = .parakeet
        let old = Task { await call.start() }
        await setup.next()
        call.stop()
        now += .seconds(42)
        call.model = .nemotron
        let current = Task { await call.start() }
        await loader.next()
        loader.release(0)
        await currentAudio.listening()
        let observedAt = now
        let status = call.status(at: observedAt)
        let state = call.state(at: observedAt)
        let started = call.started

        setup.release()
        await old.value

        #expect(oldAudio.stops == 1)
        #expect(oldAudio.listens == 0)
        #expect(loader.models == [.nemotron])
        #expect(call.isRecording)
        #expect(call.started == started)
        #expect(call.status(at: observedAt) == status)
        #expect(call.state(at: observedAt) == state)
        #expect(currentAudio.stops == 0)
        #expect(currentAudio.listens == 1)
        #expect(call.transcript.entries.isEmpty)

        call.stop()
        if !call.isRecording { currentAudio.end() }
        await current.value
        #expect(oldAudio.stops == 1)
        #expect(currentAudio.stops == 1)
        #expect(!call.isRecording)
        #expect(call.transcript.entries.map(\.settled) == ["model 0"])
    }

    @Test(arguments: [false, true])
    func aStoppedLoadCannotChangeTheNextStart(failing: Bool) async {

        let loader = Loader(held: 2)
        let oldAudio = AudioSpy(ended: true)
        let currentAudio = AudioSpy(ended: false)
        var audio = [oldAudio, currentAudio]
        let call = LiveCall(load: loader.load, beginAudio: { _, _ in audio.removeFirst().begin() })

        let old = Task { await call.start() }
        await loader.next()
        call.stop()
        let current = Task { await call.start() }
        await loader.next()
        let started = call.started
        let observedAt = ContinuousClock.now
        let status = call.status(at: observedAt)

        loader.release(0, failing: failing)
        await old.value

        #expect(oldAudio.listens == 0)
        #expect(call.isRecording)
        #expect(call.started == started)
        #expect(call.status(at: observedAt) == status)
        #expect(currentAudio.stops == 0)
        #expect(call.transcript.entries.isEmpty)

        loader.release(1)
        if call.isRecording {
            await currentAudio.listening()
            call.stop()
        } else {
            currentAudio.end()
        }
        await current.value
        #expect(currentAudio.stops == 1)
        #expect(!call.isRecording)
        #expect(call.transcript.entries.map(\.settled) == ["model 1"])
    }

    @Test(arguments: [false, true])
    func anOldLoadCannotClearARunningSession(failing: Bool) async {

        let loader = Loader(held: 2)
        let oldAudio = AudioSpy(ended: true)
        let currentAudio = AudioSpy(ended: false)
        var audio = [oldAudio, currentAudio]
        let call = LiveCall(load: loader.load, beginAudio: { _, _ in audio.removeFirst().begin() })

        let old = Task { await call.start() }
        await loader.next()
        call.stop()
        let current = Task { await call.start() }
        await loader.next()
        loader.release(1)
        await currentAudio.listening()
        let observedAt = ContinuousClock.now
        let status = call.status(at: observedAt)
        let started = call.started

        loader.release(0, failing: failing)
        await old.value

        #expect(oldAudio.listens == 0)
        #expect(call.isRecording)
        #expect(call.status(at: observedAt) == status)
        #expect(call.started == started)
        #expect(call.transcript.entries.isEmpty)
        #expect(currentAudio.stops == 0)

        call.stop()
        if !call.isRecording { currentAudio.end() }
        await current.value
        #expect(currentAudio.stops == 1)
        #expect(call.transcript.entries.map(\.settled) == ["model 1"])
    }

    @Test(arguments: [false, true])
    func stoppingDuringALoadNeverStartsAListener(failing: Bool) async {

        let loader = Loader(held: 1)
        let audio = AudioSpy(ended: true)
        let call = LiveCall(load: loader.load, beginAudio: { _, _ in audio.begin() })
        let starting = Task { await call.start() }
        await loader.next()
        call.stop()
        let observedAt = ContinuousClock.now
        let status = call.status(at: observedAt)

        loader.release(0, failing: failing)
        await starting.value

        #expect(audio.listens == 0)
        #expect(audio.stops == 1)
        #expect(!call.isRecording)
        #expect(call.status(at: observedAt) == status)
        #expect(call.transcript.entries.isEmpty)
    }

    @Test func prepareLoadsEachChosenModelOnceAndStartUsesIt() async {

        let loader = Loader(held: 2)
        let audio = AudioSpy(ended: false)
        let call = LiveCall(load: loader.load, beginAudio: { _, _ in audio.begin() })
        call.model = .parakeet
        call.prepare()
        call.prepare()
        await loader.next()
        #expect(loader.models == [.parakeet])

        call.model = .nemotron
        call.prepare()
        call.prepare()
        await loader.next()
        #expect(loader.models == [.parakeet, .nemotron])
        loader.release(0)
        loader.release(1)

        let starting = Task { await call.start() }
        await audio.listening()
        #expect(loader.models == [.parakeet, .nemotron])
        call.stop()
        await starting.value
        #expect(call.transcript.entries.map(\.settled) == ["model 1"])
    }

    @Test func recordingAndPlaybackKeepThePressInstantWhileModelsLoad() async {

        let loader = Loader(held: 1)
        let audio = AudioSpy(ended: false)
        let pressed = ContinuousClock.now
        var now = pressed
        var trackStart: ContinuousClock.Instant?
        var playbackStart: ContinuousClock.Instant?
        let call = LiveCall(load: loader.load, beginAudio: { _, instant in
            trackStart = instant
            playbackStart = now
            return audio.begin()
        }, now: { now })
        let starting = Task { await call.start() }
        await loader.next()

        #expect(trackStart == pressed)
        #expect(playbackStart == pressed)
        #expect(call.started == pressed)
        #expect(call.isRecording)
        #expect(audio.listens == 0)
        now += .seconds(42)
        #expect(call.state(at: now).recording == .on(elapsed: "00:00:42"))

        loader.release(0)
        await audio.listening()
        #expect(call.started == pressed)
        #expect(trackStart == pressed)
        #expect(playbackStart == pressed)
        #expect(call.state(at: now).recording == .on(elapsed: "00:00:42"))
        call.stop()
        await starting.value
    }

    private func recording(channels: Int) throws -> URL {

        let url = FileManager.default.temporaryDirectory.appendingPathComponent("live-call-\(UUID().uuidString).caf")
        let format = AVAudioFormat(standardFormatWithSampleRate: 16_000, channels: AVAudioChannelCount(channels))!
        let file = try AVAudioFile(forWriting: url, settings: format.settings)
        let buffer = AVAudioPCMBuffer(pcmFormat: format, frameCapacity: 1)!
        buffer.frameLength = 1
        for channel in 0..<channels { buffer.floatChannelData![channel][0] = 0 }
        try file.write(from: buffer)
        return url
    }
}

@MainActor
private final class PlayerSpy: AudioPlayer {

    private(set) var plays = 0
    private(set) var stops = 0

    func play() -> Bool {

        plays += 1
        return true
    }

    func stop() { stops += 1 }
}

/// Audio setup returns only when the test releases it.
@MainActor
private final class AudioSetup {

    private let audio: AudioSpy
    private var gate: CheckedContinuation<Void, Never>?
    private let events: AsyncStream<Void>
    private let event: AsyncStream<Void>.Continuation

    init(audio: AudioSpy) {

        self.audio = audio
        (events, event) = AsyncStream.makeStream()
    }

    func begin() async -> LiveCall.Audio {

        await withCheckedContinuation { gate in
            self.gate = gate
            event.yield(())
        }
        return audio.begin()
    }

    func next() async {

        var iterator = events.makeAsyncIterator()
        _ = await iterator.next(isolation: MainActor.shared)
    }

    func release() {

        gate?.resume()
        gate = nil
    }
}

/// Loads wait for the test; later preparation can finish without a waiter.
@MainActor
private final class Loader {

    struct Failed: Error {}

    private(set) var models: [LiveCall.Model] = []
    private var gates: [Int: CheckedContinuation<any Recognizer, any Error>] = [:]
    private let held: Int
    private let requests: AsyncStream<Void>
    private let continuation: AsyncStream<Void>.Continuation
    private var iterator: AsyncStream<Void>.Iterator

    init(held: Int) {

        self.held = held
        (requests, continuation) = AsyncStream.makeStream()
        iterator = requests.makeAsyncIterator()
    }

    func load(_ model: LiveCall.Model) async throws -> any Recognizer {

        let index = models.count
        models.append(model)
        guard index < held else { return Words(text: "spare") }
        return try await withCheckedThrowingContinuation { gate in
            gates[index] = gate
            continuation.yield(())
        }
    }

    func next() async {

        var iterator = iterator
        _ = await iterator.next(isolation: MainActor.shared)
        self.iterator = iterator
    }

    func release(_ index: Int, failing: Bool = false) {

        let gate = gates.removeValue(forKey: index)
        if failing { gate?.resume(throwing: Failed()) }
        else { gate?.resume(returning: Words(text: "model \(index)")) }
    }
}

private struct Words: Recognizer {

    let text: String

    func hear(_ chunk: AudioChunk) async throws -> Hearing { .init(words: []) }

    func finish() async throws -> Hearing {

        .init(words: [.init(text, start: 0, end: 1)], finalThrough: 1)
    }
}

/// Silent audio, with an event when a listener requests its stream.
private final class AudioSpy: AudioSource, Sendable {

    private let stream: AsyncStream<AudioChunk>
    private let continuation: AsyncStream<AudioChunk>.Continuation
    private let listensCount = Mutex(0)
    private let events: AsyncStream<Void>
    private let event: AsyncStream<Void>.Continuation
    @MainActor private(set) var stops = 0

    var listens: Int { listensCount.withLock { $0 } }

    init(ended: Bool) {

        (stream, continuation) = AsyncStream.makeStream()
        (events, event) = AsyncStream.makeStream()
        if ended { continuation.finish() }
    }

    func audio() -> AsyncStream<AudioChunk> {

        listensCount.withLock { $0 += 1 }
        event.yield(())
        return stream
    }

    @MainActor func begin() -> LiveCall.Audio {

        .init(tracks: [(.me, self)], stop: { self.stops += 1 })
    }

    func listening() async {

        var iterator = events.makeAsyncIterator()
        _ = await iterator.next()
    }

    func end() { continuation.finish() }
}
