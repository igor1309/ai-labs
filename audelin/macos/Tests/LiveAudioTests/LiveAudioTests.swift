import Synchronization
import Testing
@testable import LiveAudio

@Suite(.timeLimit(.minutes(1)))
struct LiveAudioTests {

    @Test func liveAudioPassesAHeldReader() async throws {

        let capture = FakeCapture(), gate = AudioGate()
        defer { gate.release(); capture.finish() }
        let live = LiveAudio(capture: capture)
        var listener = await live.listen().makeAsyncIterator()
        let stream = try await live.start()
        let reader = Task {
            await gate.wait()
            return try await read(stream)
        }
        await gate.waitUntilEntered()
        capture.give(tones())
        let first = try #require(await listener.next())
        let second = try #require(await listener.next())
        #expect(pieces([first, second]) == Array(tones().prefix(2)))
        #expect(gate.isHeld)
        gate.release()
        try await live.stop()
        #expect(try await reader.value == tones())
    }

    @Test func liveTimesEqualTheAudioReadBeforeEachTone() async throws {

        let capture = FakeCapture(), live = LiveAudio(capture: capture)
        let listener = await live.listen()
        let stream = try await live.start()
        capture.give(tones())
        try await live.stop()
        let audio = await heard(listener), input = try await read(stream)
        #expect(pieces(audio) == tones())
        #expect(input == tones())
        var time = 0.0
        for (heard, read) in zip(audio, input) {
            #expect(heard.start == time)
            time += Double(read.samples.count) / read.sampleRate
            #expect(heard.end == time)
        }
        #expect(live.capturedThrough == time)
    }

    @Test func readingPassesAHeldListener() async throws {

        let capture = FakeCapture(), gate = AudioGate()
        defer { gate.release(); capture.finish() }
        let live = LiveAudio(capture: capture), received = Mutex<[Audio]>([])
        let stream = await live.listen()
        let listener = Task {
            for await audio in stream {
                received.withLock { $0.append(audio) }
                if audio.start == 0 { await gate.wait() }
            }
        }
        var reader = try await live.start().makeAsyncIterator()
        capture.give([tones()[0]])
        await gate.waitUntilEntered()
        capture.give(Array(tones().dropFirst()))
        var input: [AudioPiece] = []
        for _ in tones() { input.append(try #require(await reader.next())) }
        #expect(input == tones())
        #expect(gate.isHeld)
        #expect(pieces(received.withLock { $0 }) == [tones()[0]])
        try await live.stop()
        #expect(try await reader.next() == nil)
        gate.release()
        await listener.value
        #expect(pieces(received.withLock { $0 }) == tones())
    }

    @Test func stopDeliversAllAudioThenEndsListeningAndReading() async throws {

        let capture = FakeCapture(), live = LiveAudio(capture: capture)
        var listener = await live.listen().makeAsyncIterator()
        let stream = try await live.start()
        capture.give([tones()[0]])
        let first = try #require(await listener.next())
        capture.give(Array(tones().dropFirst()))
        try await live.stop()
        var audio = [first]
        while let next = await listener.next() { audio.append(next) }
        #expect(pieces(audio) == tones())
        #expect(try await read(stream) == tones())
    }

    @Test(arguments: [false, true])
    func failedStopDrainsPiecesThatHaveNotYetBeenRead(stopEndsInput: Bool) async throws {

        let capture = FakeCapture(stopFailure: .stop, stopEndsInput: stopEndsInput)
        let input = AudioGate(), executor = CaptureExecutor(), returned = Mutex(false)
        let task = Task(executorPreference: executor) {
            defer { executor.complete() }
            let live = LiveAudio(capture: capture, beforeInput: { await input.wait() }, executor: executor)
            let listener = await live.listen()
            let stream = try await live.start()
            capture.give(tones())
            await #expect(throws: Refusal.stop) { try await live.stop() }
            returned.withLock { $0 = true }
            #expect(pieces(await heard(listener)) == tones())
            #expect(try await read(stream) == tones())
        }
        defer { input.release(); capture.finish(); executor.run() }
        await executor.run(until: { input.isHeld && capture.stops == 1 })
        #expect(input.isHeld)
        #expect(!returned.withLock { $0 })
        input.release()
        await executor.finish()
        try await task.value
        #expect(returned.withLock { $0 })
    }

    @Test func failedCaptureDeliversEveryToneThenItsFailure() async throws {

        let capture = FakeCapture(), live = LiveAudio(capture: capture)
        let listener = await live.listen()
        var reader = try await live.start().makeAsyncIterator()
        let given = Array(tones().prefix(2))
        capture.give(given)
        capture.finish(.capture)
        #expect(pieces(await heard(listener)) == given)
        var input: [AudioPiece] = []
        for _ in given { input.append(try #require(await reader.next())) }
        #expect(input == given)
        await #expect(throws: Refusal.capture) { try await reader.next() }
        #expect(capture.stops == 0)
        try await live.stop()
    }

    @Test func refusedStartEndsWaitingListening() async throws {

        let capture = FakeCapture(startFailure: .start), live = LiveAudio(capture: capture)
        let listener = await live.listen()
        capture.give(tones())
        await #expect(throws: Refusal.start) { try await live.start() }
        #expect(await heard(listener).isEmpty)
        #expect(capture.stops == 0)
    }

    @Test func listeningBeforeStartHearsTheFirstTone() async throws {

        let capture = FakeCapture(), live = LiveAudio(capture: capture)
        var listener = await live.listen().makeAsyncIterator()
        capture.give([tones()[0]])
        let stream = try await live.start()
        #expect(await listener.next()?.samples == tones()[0].samples)
        try await live.stop()
        #expect(await listener.next() == nil)
        #expect(try await read(stream) == [tones()[0]])
    }

    @Test func secondListeningEndsWithoutTakingAudioFromTheFirst() async throws {

        let capture = FakeCapture(), live = LiveAudio(capture: capture)
        var first = await live.listen().makeAsyncIterator()
        let stream = try await live.start()
        capture.give([tones()[0]])
        var audio = [try #require(await first.next())]
        #expect(await heard(await live.listen()).isEmpty)
        capture.give(Array(tones().dropFirst()))
        try await live.stop()
        while let next = await first.next() { audio.append(next) }
        #expect(pieces(audio) == tones())
        #expect(try await read(stream) == tones())
    }

    @Test func cancellingTheListenerLeavesReadingRunning() async throws {

        let capture = FakeCapture(), gate = AudioGate(), live = LiveAudio(capture: capture)
        defer { capture.finish(); gate.release() }
        let stream = await live.listen(), received = Mutex<[Audio]>([])
        let listener = Task {
            for await audio in stream {
                received.withLock { $0.append(audio) }
                await gate.wait()
            }
        }
        defer { listener.cancel() }
        let reader = try await live.start()
        capture.give([tones()[0]])
        await gate.waitUntilEntered()
        listener.cancel()
        gate.release()
        await listener.value
        #expect(capture.stops == 0)
        capture.give(Array(tones().dropFirst()))
        try await live.stop()
        #expect(try await read(reader) == tones())
        #expect(pieces(received.withLock { $0 }) == [tones()[0]])
    }

    @Test func capturedThroughIncludesAudioBeforeItIsHeard() async throws {

        let capture = FakeCapture(), live = LiveAudio(capture: capture)
        #expect(live.capturedThrough == 0)
        let listener = await live.listen()
        var reader = try await live.start().makeAsyncIterator()
        var time = 0.0
        for tone in tones() {
            capture.give([tone])
            #expect(try await reader.next() == tone)
            time += Double(tone.samples.count) / tone.sampleRate
            #expect(live.capturedThrough == time)
        }
        #expect(live.capturedThrough == time)
        try await live.stop()
        #expect(pieces(await heard(listener)) == tones())
    }

    @Test func aSecondStartIsRefusedWithoutEndingTheFirst() async throws {

        let capture = FakeCapture(), live = LiveAudio(capture: capture)
        let listener = await live.listen(), reader = try await live.start()
        await #expect(throws: LifecycleError.alreadyStarted) { try await live.start() }
        capture.give(tones())
        try await live.stop()
        #expect(pieces(await heard(listener)) == tones())
        #expect(try await read(reader) == tones())
    }

    @Test func stoppingBeforeStartEndsListeningAndPreventsStarting() async throws {

        let capture = FakeCapture(), live = LiveAudio(capture: capture)
        let listener = await live.listen()
        try await live.stop()
        try await live.stop()
        await #expect(throws: LifecycleError.alreadyStarted) { try await live.start() }
        #expect(await heard(listener).isEmpty)
        #expect(capture.stops == 0)
    }

    @Test func repeatedStopsKeepTheFailureAndStopTheCaptureOnce() async throws {

        let capture = FakeCapture(stopFailure: .stop), live = LiveAudio(capture: capture)
        let listener = await live.listen(), reader = try await live.start()
        capture.give(tones())
        for _ in 0..<2 { await #expect(throws: Refusal.stop) { try await live.stop() } }
        #expect(pieces(await heard(listener)) == tones())
        #expect(try await read(reader) == tones())
        #expect(capture.stops == 1)
    }
}
