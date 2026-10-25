import Synchronization
import Testing
@testable import RecordedCapture

@Suite(.timeLimit(.minutes(1)))
struct RecordedCaptureTests {

    @Test func capturedTonesAreHeardAndKeptInOrder() async throws {

        let capture = FakeCapture(), track = FakeTrack()
        let recorded = RecordedCapture(capture: capture, track: track)
        let live = await recorded.listen()
        try await recorded.start()
        capture.give(tones())
        try await recorded.stop()
        #expect(pieces(await heard(live)) == tones())
        #expect(track.pieces == tones())
    }

    @Test func liveAudioPassesAHeldFirstWrite() async throws {

        let capture = FakeCapture(), track = FakeTrack(heldWrite: 1)
        defer { track.gate.release(); capture.finish() }
        let recorded = RecordedCapture(capture: capture, track: track)
        var live = await recorded.listen().makeAsyncIterator()
        try await recorded.start()
        capture.give(tones())
        await track.gate.waitUntilEntered()
        let first = try #require(await live.next())
        let second = try #require(await live.next())
        #expect(pieces([first, second]) == Array(tones().prefix(2)))
        #expect(track.gate.isHeld)
        #expect(track.pieces.isEmpty)
        track.gate.release()
        try await recorded.stop()
        #expect(track.pieces == tones())
    }

    @Test func liveTimesEqualTheAudioWrittenBeforeEachTone() async throws {

        let capture = FakeCapture(), track = FakeTrack()
        let recorded = RecordedCapture(capture: capture, track: track)
        let live = await recorded.listen()
        try await recorded.start()
        capture.give(tones())
        try await recorded.stop()
        let audio = await heard(live)
        #expect(pieces(audio) == tones())
        #expect(track.pieces == tones())
        var time = 0.0
        for (heard, written) in zip(audio, track.pieces) {
            #expect(heard.start == time)
            time += Double(written.samples.count) / written.sampleRate
            #expect(heard.end == time)
        }
    }

    @Test func stopWaitsForTheHeldLastWrite() async throws {

        try await expectHeldStop(stopFailure: nil, stopEndsInput: true)
    }

    @Test func stopDeliversAllAudioThenEndsListening() async throws {

        let capture = FakeCapture(), track = FakeTrack()
        let recorded = RecordedCapture(capture: capture, track: track)
        var live = await recorded.listen().makeAsyncIterator()
        try await recorded.start()
        capture.give([tones()[0]])
        let first = try #require(await live.next())
        capture.give(Array(tones().dropFirst()))
        try await recorded.stop()
        var audio = [first]
        while let next = await live.next() { audio.append(next) }
        #expect(pieces(audio) == tones())
        #expect(track.pieces == tones())
    }

    @Test func failedSecondWriteReportsTrackStopsCaptureAndEndsLive() async throws {

        let capture = FakeCapture(), track = FakeTrack(failingWrite: 2)
        defer { capture.finish() }
        let recorded = RecordedCapture(capture: capture, track: track)
        let live = await recorded.listen()
        var failures = recorded.failures.makeAsyncIterator()
        try await recorded.start()
        capture.give(tones())
        let failure = try #require(await failures.next())
        guard case .track(let cause) = failure else {
            Issue.record("Expected a track failure"); return
        }
        #expect(cause as? Refusal == .write)
        await capture.waitUntilStopped()
        #expect(capture.stops == 1)
        let audio = await heard(live)
        #expect(pieces(Array(audio.prefix(1))) == Array(tones().prefix(1)))
        #expect(track.pieces == Array(tones().prefix(1)))
        await #expect(throws: Failure.self) { try await recorded.stop() }
        #expect(capture.stops == 1)
    }

    @Test func failedFirstWriteStillDeliversItsAudio() async throws {

        let capture = FakeCapture(), track = FakeTrack(failingWrite: 1)
        defer { capture.finish() }
        let recorded = RecordedCapture(capture: capture, track: track)
        let live = await recorded.listen()
        var failures = recorded.failures.makeAsyncIterator()
        try await recorded.start()
        capture.give([tones()[0]])
        guard case .track(let cause) = try #require(await failures.next()) else {
            Issue.record("Expected a track failure"); return
        }
        #expect(cause as? Refusal == .write)
        #expect(pieces(await heard(live)) == [tones()[0]])
        #expect(track.pieces.isEmpty)
        await #expect(throws: Failure.self) { try await recorded.stop() }
        #expect(capture.stops == 1)
    }

    @Test func failedCaptureReportsBeforeStopAndKeepsEveryGivenTone() async throws {

        let capture = FakeCapture(), track = FakeTrack()
        let recorded = RecordedCapture(capture: capture, track: track)
        let live = await recorded.listen()
        var failures = recorded.failures.makeAsyncIterator()
        try await recorded.start()
        let given = Array(tones().prefix(2))
        capture.give(given)
        capture.finish(.capture)
        let failure = try #require(await failures.next())
        guard case .capture(let cause) = failure else {
            Issue.record("Expected a capture failure"); return
        }
        #expect(cause as? Refusal == .capture)
        #expect(capture.stops == 0)
        #expect(pieces(await heard(live)) == given)
        await #expect(throws: Failure.self) { try await recorded.stop() }
        #expect(track.pieces == given)
    }

    @Test func captureFailureIsReportedWhileTheFirstWriteIsHeld() async throws {

        let capture = FakeCapture(), track = FakeTrack(heldWrite: 1)
        defer { track.gate.release(); capture.finish() }
        let recorded = RecordedCapture(capture: capture, track: track)
        let live = await recorded.listen()
        var failures = recorded.failures.makeAsyncIterator()
        try await recorded.start()
        capture.give(tones())
        await track.gate.waitUntilEntered()
        capture.finish(.capture)
        let failure = try #require(await failures.next())
        guard case .capture(let cause) = failure else {
            Issue.record("Expected a capture failure"); return
        }
        #expect(cause as? Refusal == .capture)
        #expect(track.gate.isHeld)
        #expect(track.pieces.isEmpty)
        #expect(capture.stops == 0)
        #expect(pieces(await heard(live)) == tones())
        track.gate.release()
        await #expect(throws: Failure.self) { try await recorded.stop() }
        #expect(track.pieces == tones())
    }

    @Test(arguments: [false, true])
    func failedStopWaitsForEveryGivenTone(stopEndsInput: Bool) async throws {

        try await expectHeldStop(stopFailure: .stop, stopEndsInput: stopEndsInput)
    }

    @Test func secondListeningEndsWithoutTakingAudioFromTheFirst() async throws {

        let capture = FakeCapture(), track = FakeTrack()
        let recorded = RecordedCapture(capture: capture, track: track)
        var first = await recorded.listen().makeAsyncIterator()
        try await recorded.start()
        capture.give([tones()[0]])
        var audio = [try #require(await first.next())]
        let second = await recorded.listen()
        #expect(await heard(second).isEmpty)
        capture.give(Array(tones().dropFirst()))
        try await recorded.stop()
        while let next = await first.next() { audio.append(next) }
        #expect(pieces(audio) == tones())
        #expect(track.pieces == tones())
    }

    @Test func cancellingTheListenerLeavesRecordingRunning() async throws {

        let capture = FakeCapture(), track = FakeTrack(), listenerGate = WriteGate()
        defer { capture.finish(); listenerGate.release() }
        let recorded = RecordedCapture(capture: capture, track: track)
        let live = await recorded.listen(), received = Mutex<[Audio]>([])
        let listener = Task {
            for await audio in live {
                received.withLock { $0.append(audio) }
                await listenerGate.wait()
            }
        }
        defer { listener.cancel() }
        try await recorded.start()
        capture.give([tones()[0]])
        await listenerGate.waitUntilEntered()
        listener.cancel()
        listenerGate.release()
        await listener.value
        #expect(capture.stops == 0)
        capture.give(Array(tones().dropFirst()))
        try await recorded.stop()
        #expect(track.pieces == tones())
        #expect(pieces(received.withLock { $0 }) == [tones()[0]])
    }

    @Test func listeningBeforeStartHearsTheFirstTone() async throws {

        let capture = FakeCapture(), track = FakeTrack()
        let recorded = RecordedCapture(capture: capture, track: track)
        var live = await recorded.listen().makeAsyncIterator()
        capture.give([tones()[0]])
        try await recorded.start()
        #expect(await live.next()?.samples == tones()[0].samples)
        try await recorded.stop()
        #expect(await live.next() == nil)
        #expect(track.pieces == [tones()[0]])
    }

    @Test func refusedStartWritesNothingAndEndsWaitingListening() async throws {

        let capture = FakeCapture(startFailure: .start), track = FakeTrack()
        let recorded = RecordedCapture(capture: capture, track: track)
        let live = await recorded.listen()
        capture.give(tones())
        do {
            try await recorded.start()
            Issue.record("Expected start to fail")
        } catch let failure as Failure {
            guard case .capture(let cause) = failure else {
                Issue.record("Expected a capture failure"); return
            }
            #expect(cause as? Refusal == .start)
        }
        #expect(await heard(live).isEmpty)
        #expect(track.pieces.isEmpty)
        #expect(capture.stops == 0)
    }

    @Test func aSecondStartIsRefusedWithoutEndingTheFirst() async throws {

        let capture = FakeCapture(), track = FakeTrack()
        let recorded = RecordedCapture(capture: capture, track: track)
        let live = await recorded.listen()
        try await recorded.start()
        await #expect(throws: LifecycleError.alreadyStarted) { try await recorded.start() }
        capture.give(tones())
        try await recorded.stop()
        #expect(pieces(await heard(live)) == tones())
        #expect(track.pieces == tones())
    }

    @Test func stoppingBeforeStartEndsStreamsAndPreventsStarting() async throws {

        let capture = FakeCapture(), track = FakeTrack()
        let recorded = RecordedCapture(capture: capture, track: track)
        let live = await recorded.listen()
        try await recorded.stop()
        try await recorded.stop()
        await #expect(throws: LifecycleError.alreadyStarted) { try await recorded.start() }
        #expect(await heard(live).isEmpty)
        var failures = recorded.failures.makeAsyncIterator()
        #expect(await failures.next() == nil)
        #expect(track.pieces.isEmpty)
        #expect(capture.stops == 0)
    }

    @Test func repeatedStopsKeepTheFailureAndStopTheCaptureOnce() async throws {

        let capture = FakeCapture(stopFailure: .stop), track = FakeTrack()
        let recorded = RecordedCapture(capture: capture, track: track)
        try await recorded.start()
        capture.give(tones())
        for _ in 0..<2 {
            do {
                try await recorded.stop()
                Issue.record("Expected stop to fail")
            } catch let failure as Failure {
                guard case .capture(let cause) = failure else {
                    Issue.record("Expected a capture stop failure"); return
                }
                #expect(cause as? Refusal == .stop)
            }
        }
        var failures = recorded.failures.makeAsyncIterator()
        let failure = try #require(await failures.next())
        guard case .capture(let cause) = failure else {
            Issue.record("Expected a capture stop failure"); return
        }
        #expect(cause as? Refusal == .stop)
        #expect(await failures.next() == nil)
        #expect(track.pieces == tones())
        #expect(capture.stops == 1)
    }

    @Test(arguments: [false, true])
    func failedStopDrainsPiecesThatHaveNotYetBeenRead(stopEndsInput: Bool) async throws {

        let capture = FakeCapture(stopFailure: .stop, stopEndsInput: stopEndsInput)
        let track = FakeTrack(), input = WriteGate(), executor = CaptureExecutor()
        let returned = Mutex(false)
        let task = Task(executorPreference: executor) {
            defer { executor.complete() }
            let recorded = RecordedCapture(
                capture: capture, track: track, beforeInput: { await input.wait() }, executor: executor
            )
            let live = await recorded.listen()
            try await recorded.start()
            capture.give(tones())
            await #expect(throws: Failure.self) { try await recorded.stop() }
            returned.withLock { $0 = true }
            #expect(pieces(await heard(live)) == tones())
            #expect(track.pieces == tones())
        }
        defer { input.release(); capture.finish(); executor.run() }
        await executor.run(until: { input.isHeld && capture.stops == 1 })
        #expect(input.isHeld)
        #expect(!returned.withLock { $0 })
        #expect(track.pieces.isEmpty)
        input.release()
        await executor.finish()
        try await task.value
        #expect(returned.withLock { $0 })
    }
}

private func expectHeldStop(stopFailure: Refusal?, stopEndsInput: Bool) async throws {

    let capture = FakeCapture(stopFailure: stopFailure, stopEndsInput: stopEndsInput)
    let track = FakeTrack(heldWrite: 2), executor = CaptureExecutor()
    let returned = Mutex(false)
    let task = Task(executorPreference: executor) {
        defer { executor.complete() }
        let recorded = RecordedCapture(capture: capture, track: track, executor: executor)
        let live = await recorded.listen()
        try await recorded.start()
        let given = Array(tones().prefix(2))
        capture.give(given)
        if stopFailure != nil {
            do {
                try await recorded.stop()
                Issue.record("Expected stop to fail")
            } catch let failure as Failure {
                guard case .capture(let cause) = failure else {
                    Issue.record("Expected a capture stop failure"); return
                }
                #expect(cause as? Refusal == .stop)
            }
        } else {
            try await recorded.stop()
        }
        returned.withLock { $0 = true }
        #expect(track.pieces == given)
        #expect(pieces(await heard(live)) == given)
    }
    defer { track.gate.release(); capture.finish(); executor.run() }
    await executor.run(until: { track.gate.isHeld && capture.stops == 1 })
    #expect(track.gate.isHeld)
    #expect(!returned.withLock { $0 })
    #expect(track.pieces == Array(tones().prefix(1)))
    track.gate.release()
    await executor.finish()
    try await task.value
    #expect(returned.withLock { $0 })
}
