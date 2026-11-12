import BlockingTestWork
import CallDiarizer
import Foundation
import Synchronization
import Testing

@Suite(.timeLimit(.minutes(1)))
struct CallDiarizerTests {

    @Test func aCallTrackIsSplitIntoTurnsByNemotron() async throws {

        try await withAudioDirectory { directory in
            let track = directory.appendingPathComponent("track.wav")
            try writeWave(track, channels: [Array(repeating: 0.5, count: 96_000), Array(repeating: 0, count: 96_000)], rate: 48_000)
            let binding = FakeBinding(nemotron: .success([
                EngineTurn(speaker: "5", start: 1, end: 1.8), EngineTurn(speaker: "2", start: 0.1, end: 0.8),
            ]))

            let result = try await CallDiarizer(binding: binding).diarize(track)

            #expect(result == .init(model: .nemotron, turns: [
                .init(speaker: 2, start: 0.1, end: 0.8), .init(speaker: 5, start: 1, end: 1.8),
            ]))
            let requests = await binding.requests
            #expect(requests.map(\.kind) == [.load, .nemotron])
            let samples = try #require(requests.last?.samples)
            #expect(abs(samples.count - 32_000) <= 64)
            #expect(samples.allSatisfy { $0.isFinite })
            #expect(abs(try #require(samples.dropFirst(1_000).first) - 0.25) < 0.001)
        }
    }

    @Test(arguments: [nil, 3])
    func nemotronFailingToLoadFallsBackToVBx(speakers: Int?) async throws {

        try await withTrack { track in
            let binding = FakeBinding(load: .failure(BindingFailure.load), vbx: .success(vbxTurns))

            let result = try await CallDiarizer(binding: binding).diarize(track, speakers: speakers)

            #expect(result == .init(model: .vbx, turns: numberedVBxTurns))
            let requests = await binding.requests
            #expect(requests.map(\.kind) == [.load, .vbx])
            #expect(requests.last?.speakers == speakers)
            #expect(requests.last?.samples == Array(repeating: 0.25, count: 16_000))
        }
    }

    @Test(arguments: [nil, 4])
    func nemotronFailingToRunFallsBackToVBx(speakers: Int?) async throws {

        try await withTrack { track in
            let binding = FakeBinding(nemotron: .failure(BindingFailure.run), vbx: .success(vbxTurns))

            let result = try await CallDiarizer(binding: binding).diarize(track, speakers: speakers)

            #expect(result == .init(model: .vbx, turns: numberedVBxTurns))
            let requests = await binding.requests
            #expect(requests.map(\.kind) == [.load, .nemotron, .vbx])
            #expect(requests.last?.speakers == speakers)
            #expect(requests[1].samples == requests[2].samples)
        }
    }

    @Test func aNemotronSpeakerThatIsNotANumberFallsBackToVBx() async throws {

        try await withTrack { track in
            let binding = FakeBinding(nemotron: .success([EngineTurn(speaker: "A", start: 0.2, end: 0.7)]), vbx: .success(vbxTurns))

            let result = try await CallDiarizer(binding: binding).diarize(track)

            #expect(result == .init(model: .vbx, turns: numberedVBxTurns))
            #expect(await binding.requests.map(\.kind) == [.load, .nemotron, .vbx])
        }
    }

    @Test(arguments: [(8, 9), (2, 3)])
    func moreSpeakersThanNemotronHoldsGoToVBx(slots: Int, speakers: Int) async throws {

        try await withTrack { track in
            let binding = FakeBinding(slots: slots, vbx: .success(vbxTurns))

            let result = try await CallDiarizer(binding: binding).diarize(track, speakers: speakers)

            #expect(result == .init(model: .vbx, turns: numberedVBxTurns))
            let requests = await binding.requests
            #expect(requests.map(\.kind) == [.vbx])
            #expect(requests.first?.speakers == speakers)
            #expect(requests.first?.samples == Array(repeating: 0.25, count: 16_000))
        }
    }

    @Test(arguments: [(8, 8), (8, 2), (2, 2)])
    func aKnownCountNemotronHoldsStaysWithNemotron(slots: Int, speakers: Int) async throws {

        try await withTrack { track in
            let binding = FakeBinding(slots: slots, nemotron: .success([EngineTurn(speaker: "1", start: 0.2, end: 0.7)]))

            let result = try await CallDiarizer(binding: binding).diarize(track, speakers: speakers)

            #expect(result == .init(model: .nemotron, turns: [.init(speaker: 1, start: 0.2, end: 0.7)]))
            #expect(await binding.requests.map(\.kind) == [.load, .nemotron])
        }
    }

    @Test func vbxSpeakersAreNumberedInOrderOfFirstSpeech() async throws {

        try await withTrack { track in
            let binding = FakeBinding(vbx: .success([
                EngineTurn(speaker: "S2", start: 0.8, end: 0.9),
                EngineTurn(speaker: "S3", start: 0.1, end: 0.3),
                EngineTurn(speaker: "S3", start: 0.6, end: 0.7),
                EngineTurn(speaker: "S1", start: 0.4, end: 0.5),
            ]))

            let result = try await CallDiarizer(binding: binding).diarize(track, speakers: 9)

            #expect(result == .init(model: .vbx, turns: [
                .init(speaker: 0, start: 0.1, end: 0.3), .init(speaker: 1, start: 0.4, end: 0.5),
                .init(speaker: 0, start: 0.6, end: 0.7), .init(speaker: 2, start: 0.8, end: 0.9),
            ]))
        }
    }

    @Test(arguments: [nil, 9])
    func anEmptyTrackHasNoTurns(speakers: Int?) async throws {

        try await withTrack(samples: []) { track in
            let binding = FakeBinding()

            let result = try await CallDiarizer(binding: binding).diarize(track, speakers: speakers)

            #expect(result == .init(model: .nemotron, turns: []))
            #expect(await binding.requests.isEmpty)
        }
    }

    @Test(arguments: [false, true])
    func noTurnsFromAModelDoesNotAskAnotherModel(vbx: Bool) async throws {

        try await withTrack { track in
            let binding = FakeBinding()

            let result = try await CallDiarizer(binding: binding).diarize(track, speakers: vbx ? 9 : nil)

            #expect(result == .init(model: vbx ? .vbx : .nemotron, turns: []))
            #expect(await binding.requests.map(\.kind) == (vbx ? [.vbx] : [.load, .nemotron]))
        }
    }

    @Test(arguments: [false, true])
    func bothModelsFailingFailsThePass(loadFails: Bool) async throws {

        try await withTrack { track in
            let binding = FakeBinding(
                load: loadFails ? .failure(BindingFailure.load) : .success(()),
                nemotron: .failure(BindingFailure.run), vbx: .failure(BindingFailure.vbx)
            )

            await #expect(throws: BindingFailure.vbx) {
                try await CallDiarizer(binding: binding).diarize(track)
            }
            #expect(await binding.requests.map(\.kind) == (loadFails ? [.load, .vbx] : [.load, .nemotron, .vbx]))
        }
    }

    @Test func anUnreadableTrackFailsThePass() async throws {

        try await withAudioDirectory { directory in
            let track = directory.appendingPathComponent("unreadable.wav")
            try Data("This is not audio".utf8).write(to: track)
            let binding = FakeBinding()

            await #expect(throws: (any Error).self) { try await CallDiarizer(binding: binding).diarize(track) }
            #expect(await binding.requests.isEmpty)
        }
    }

    @Test(arguments: [false, true])
    func nemotronCancellationDoesNotFallBack(loadCancels: Bool) async throws {

        try await withTrack { track in
            let binding = FakeBinding(
                load: loadCancels ? .failure(CancellationError()) : .success(()),
                nemotron: .failure(CancellationError()), vbx: .success(vbxTurns)
            )

            await #expect(throws: CancellationError.self) { try await CallDiarizer(binding: binding).diarize(track) }
            #expect(await binding.requests.map(\.kind) == (loadCancels ? [.load] : [.load, .nemotron]))
        }
    }

    @Test func nemotronIsLoadedOnceForEveryPass() async throws {

        try await withTrack { track in
            let binding = FakeBinding()
            let diarizer = CallDiarizer(binding: binding)

            await diarizer.prepare()
            _ = try await diarizer.diarize(track)
            _ = try await diarizer.diarize(track)

            #expect(await binding.requests.map(\.kind) == [.load, .nemotron, .nemotron])
        }
    }

    @Test func preparingStartsTheLoadBeforeAnyPass() async throws {

        let loads = AsyncStream<Void>.makeStream()
        let binding = FakeBinding(loaded: { loads.continuation.yield() })

        await CallDiarizer(binding: binding).prepare()

        var iterator = loads.stream.makeAsyncIterator()
        await iterator.next()
        #expect(await binding.requests.map(\.kind) == [.load])
    }

    @Test func preparingReturnsWhileTheLoadIsStillPending() async throws {

        let binding = HeldBinding()
        defer { binding.release() }

        await CallDiarizer(binding: binding).prepare()

        #expect(!binding.loadEnded)
        var started = binding.started.makeAsyncIterator()
        await started.next()
    }

    @Test func aFailedLoadIsTriedAgainByTheNextPass() async throws {

        try await withTrack { track in
            let binding = FakeBinding(load: .failure(BindingFailure.load), vbx: .success(vbxTurns))
            let diarizer = CallDiarizer(binding: binding)

            _ = try await diarizer.diarize(track)
            _ = try await diarizer.diarize(track)

            #expect(await binding.requests.map(\.kind) == [.load, .vbx, .load, .vbx])
        }
    }

    @Test func directVBxFailurePropagates() async throws {

        try await withTrack { track in
            let binding = FakeBinding(vbx: .failure(BindingFailure.vbx))

            await #expect(throws: BindingFailure.vbx) { try await CallDiarizer(binding: binding).diarize(track, speakers: 9) }
            #expect(await binding.requests.map(\.kind) == [.vbx])
        }
    }
}

/// A Nemotron load that starts and then waits until it is released.
private final class HeldBinding: DiarizationBinding, Sendable {

    struct Released: Error {}

    let started: AsyncStream<Void>
    private let startedSink: AsyncStream<Void>.Continuation
    private let gate = AsyncStream<Void>.makeStream()
    private let ended = Mutex(false)

    init() { (started, startedSink) = AsyncStream<Void>.makeStream() }

    var loadEnded: Bool { ended.withLock { $0 } }
    var nemotronSlots: Int { 8 }

    func release() { gate.continuation.finish() }

    func loadNemotron() async throws -> @Sendable ([Float]) async throws -> [EngineTurn] {
        startedSink.yield()
        for await _ in gate.stream {}
        ended.withLock { $0 = true }
        throw Released()
    }

    func vbx(_ samples: [Float], speakers: Int?) async throws -> [EngineTurn] { throw Released() }
}

private enum BindingFailure: Error { case load, run, vbx }

private actor FakeBinding: DiarizationBinding {

    struct Request: Sendable {
        enum Kind { case load, nemotron, vbx }
        let kind: Kind
        let samples: [Float]?
        let speakers: Int?
    }

    let nemotronSlots: Int
    private let load: Result<Void, any Error>
    private let nemotronResult: Result<[EngineTurn], any Error>
    private let vbxResult: Result<[EngineTurn], any Error>
    private let loaded: @Sendable () -> Void
    private(set) var requests: [Request] = []

    init(
        slots: Int = 8, load: Result<Void, any Error> = .success(()),
        nemotron: Result<[EngineTurn], any Error> = .success([]), vbx: Result<[EngineTurn], any Error> = .success([]),
        loaded: @escaping @Sendable () -> Void = {}
    ) {
        nemotronSlots = slots; self.load = load; nemotronResult = nemotron; vbxResult = vbx; self.loaded = loaded
    }

    func loadNemotron() throws -> @Sendable ([Float]) async throws -> [EngineTurn] {

        requests.append(.init(kind: .load, samples: nil, speakers: nil))
        loaded()
        try load.get()
        return { try await self.runNemotron($0) }
    }

    private func runNemotron(_ samples: [Float]) throws -> [EngineTurn] {

        requests.append(.init(kind: .nemotron, samples: samples, speakers: nil))
        return try nemotronResult.get()
    }

    func vbx(_ samples: [Float], speakers: Int?) throws -> [EngineTurn] {

        requests.append(.init(kind: .vbx, samples: samples, speakers: speakers))
        return try vbxResult.get()
    }
}

private var vbxTurns: [EngineTurn] {
    [EngineTurn(speaker: "remote", start: 0.2, end: 0.7)]
}

private var numberedVBxTurns: [CallDiarizer.Turn] {
    [.init(speaker: 0, start: 0.2, end: 0.7)]
}

private func withTrack(
    samples: [Float] = Array(repeating: 0.25, count: 16_000),
    _ body: (URL) async throws -> Void
) async throws {

    try await withAudioDirectory { directory in
        let track = directory.appendingPathComponent("track.wav")
        try writeWave(track, channels: [samples], rate: 16_000)
        try await body(track)
    }
}
