import Testing
@testable import LiveAudio

@Suite(.timeLimit(.minutes(1)))
struct LiveAudioStatisticsTests {

    @Test func onlyFiniteNonzeroSamplesCount() async throws {

        let samples: [[Float]] = [
            [0, -0.0], [0, 0.5, 0], [.nan, .nan], [.infinity, -.infinity],
            [.nan, -.leastNonzeroMagnitude, .infinity], [],
        ]
        let values = try await measure(samples.map { AudioPiece(samples: $0, sampleRate: 100) })
        #expect(values.map(\.hasFiniteNonzeroSample) == [false, true, false, false, true, false])
        var position = 0.0
        for (value, samples) in zip(values, samples) {
            #expect(value.start == position)
            position += Double(samples.count) / 100
            #expect(value.end == position)
        }
        #expect(values.last?.windows.isEmpty == true)
    }

    @Test(arguments: [8_000.0, 11_025, 16_000, 44_100, 48_000])
    func windowValuesAndTimesDoNotDependOnPieceBoundaries(rate: Double) async throws {

        let samples = (0..<5_003).map { Float($0 % 13 - 6) / 8 }
        let whole = try await measure([AudioPiece(samples: samples, sampleRate: rate)])
        let cuts = [0, 1, 7, 93, 1_003, 1_119, 3_999, samples.count]
        let split = try await measure(zip(cuts, cuts.dropFirst()).map { start, end in
            AudioPiece(samples: Array(samples[start..<end]), sampleRate: rate)
        })
        #expect(split.flatMap(\.windows) == whole.flatMap(\.windows))
        #expect(whole.flatMap(\.windows).count == Int(Double(samples.count) / rate * 50))
        for (index, window) in whole.flatMap(\.windows).enumerated() {
            #expect(window.start == Double(index) / 50)
            #expect(window.end == Double(index + 1) / 50)
        }
    }

    @Test func windowsCarrySamplesAcrossPiecesAndHaveKnownRMS() async throws {

        let values = try await measure([
            AudioPiece(samples: [3], sampleRate: 100),
            AudioPiece(samples: [4, -3, -4, 0, 0, 2, -2], sampleRate: 100),
        ])
        #expect(values[0].windows.isEmpty)
        #expect(values[1].windows == [
            .init(start: 0, end: 0.02, rms: 12.5.squareRoot()),
            .init(start: 0.02, end: 0.04, rms: 12.5.squareRoot()),
            .init(start: 0.04, end: 0.06, rms: 0),
            .init(start: 0.06, end: 0.08, rms: 2),
        ])
    }

    @Test func fractionalSampleBoundariesWeightEachSampleByDuration() async throws {

        let values = try await measure([AudioPiece(samples: [1, 3, 5], sampleRate: 75)])
        #expect(values[0].windows == [
            .init(start: 0, end: 0.02, rms: (11.0 / 3).squareRoot()),
            .init(start: 0.02, end: 0.04, rms: (59.0 / 3).squareRoot()),
        ])
    }

    @Test func nonfiniteWindowsDoNotContaminateLaterWindows() async throws {

        let values = try await measure([
            AudioPiece(samples: [.nan], sampleRate: 100),
            AudioPiece(samples: [1, .infinity, -.infinity, 2, -2], sampleRate: 100),
        ])
        let windows = values.flatMap(\.windows)
        #expect(windows.count == 3)
        #expect(windows[0].rms.isNaN)
        #expect(windows[1].rms.isInfinite)
        #expect(windows[2] == .init(start: 0.04, end: 0.06, rms: 2))
    }

    @Test(arguments: [1, 19, 20, 21, 39, 40, 41])
    func trailingPartialWindowIsDropped(sampleCount: Int) async throws {

        let values = try await measure([
            AudioPiece(samples: Array(repeating: 3, count: sampleCount), sampleRate: 1_000),
        ])
        #expect(values[0].windows.count == sampleCount / 20)
        #expect(values[0].windows.allSatisfy { $0.rms == 3 })
        #expect(values[0].windows.last?.end == (sampleCount < 20 ? nil : Double(sampleCount / 20) / 50))
    }

    @Test func rateChangeDropsPartialWindowAndRestartsAtTheNewPiece() async throws {

        let values = try await measure([
            AudioPiece(samples: [2, 2, 99], sampleRate: 100),
            AudioPiece(samples: [4, 4], sampleRate: 200),
            AudioPiece(samples: [4, 4], sampleRate: 200),
        ])
        #expect(values[0].windows == [.init(start: 0, end: 0.02, rms: 2)])
        #expect(values[1].start == 0.03)
        #expect(values[1].windows.isEmpty)
        #expect(values[2].windows == [.init(start: 0.03, end: 0.05, rms: 4)])
    }

    @Test(arguments: [false, true])
    func statisticsAndListenerHaveIndependentFirstSubscribers(statisticsFirst: Bool) async throws {

        let capture = FakeCapture(), live = LiveAudio(capture: capture)
        defer { capture.finish() }
        let statistics: AsyncStream<AudioStatistics>
        let listener: AsyncStream<Audio>
        if statisticsFirst {
            statistics = await live.statistics()
            listener = await live.listen()
        } else {
            listener = await live.listen()
            statistics = await live.statistics()
        }
        var measured = statistics.makeAsyncIterator()
        var heard = listener.makeAsyncIterator()
        let reader = try await live.start()
        capture.give([tones()[0]])
        let first = try #require(await measured.next())
        #expect(first.start == 0)
        #expect(first.end == Double(tones()[0].samples.count) / tones()[0].sampleRate)
        #expect(first.hasFiniteNonzeroSample)
        #expect(await collect(await live.statistics()).isEmpty)
        #expect(await collect(await live.listen()).isEmpty)
        capture.give(Array(tones().dropFirst()))
        try await live.stop()
        var values = [first]
        while let next = await measured.next() { values.append(next) }
        var audio: [Audio] = []
        while let next = await heard.next() { audio.append(next) }
        #expect(pieces(audio) == tones())
        #expect(try await read(reader) == tones())
        #expect(values.map(\.start) == audio.map(\.start))
        #expect(values.map(\.end) == audio.map(\.end))
        #expect(values.allSatisfy { $0.hasFiniteNonzeroSample })
    }

    @Test func unreadStatisticsDoNotHoldListeningOrReading() async throws {

        let capture = FakeCapture(), live = LiveAudio(capture: capture)
        defer { capture.finish() }
        let statistics = await live.statistics()
        var listener = await live.listen().makeAsyncIterator()
        var reader = try await live.start().makeAsyncIterator()
        for piece in tones() {
            capture.give([piece])
            #expect(await listener.next()?.samples == piece.samples)
            #expect(try await reader.next() == piece)
        }
        try await live.stop()
        #expect(await listener.next() == nil)
        #expect(try await reader.next() == nil)
        #expect(await collect(statistics).map(\.end).last == live.capturedThrough)
    }

    @Test(arguments: [false, true])
    func inputEndingFinishesStatisticsAfterEveryPiece(failure: Bool) async throws {

        let capture = FakeCapture(), live = LiveAudio(capture: capture)
        let statistics = await live.statistics(), listener = await live.listen()
        let reader = try await live.start()
        capture.give(tones())
        capture.finish(failure ? .capture : nil)
        let values = await collect(statistics), audio = await heard(listener)
        #expect(values.map(\.start) == audio.map(\.start))
        #expect(values.map(\.end) == audio.map(\.end))
        #expect(pieces(audio) == tones())
        if failure {
            await #expect(throws: Refusal.capture) { try await read(reader) }
        } else {
            #expect(try await read(reader) == tones())
        }
        try await live.stop()
    }

    @Test func refusedStartFinishesStatisticsWithoutValues() async {

        let capture = FakeCapture(startFailure: .start), live = LiveAudio(capture: capture)
        let statistics = await live.statistics()
        await #expect(throws: Refusal.start) { try await live.start() }
        #expect(await collect(statistics).isEmpty)
    }

    @Test func stopBeforeStartFinishesStatisticsWithoutValues() async throws {

        let live = LiveAudio(capture: FakeCapture())
        let statistics = await live.statistics()
        try await live.stop()
        #expect(await collect(statistics).isEmpty)
    }
}

private func measure(_ pieces: [AudioPiece]) async throws -> [AudioStatistics] {

    let capture = FakeCapture(), live = LiveAudio(capture: capture)
    let statistics = await live.statistics()
    _ = try await live.start()
    capture.give(pieces)
    capture.finish()
    let values = await collect(statistics)
    try await live.stop()
    return values
}

private func collect<Value: Sendable>(_ stream: AsyncStream<Value>) async -> [Value] {

    var values: [Value] = []
    for await value in stream { values.append(value) }
    return values
}
