import Synchronization
import Testing
@testable import RecordedCapture

@Suite(.timeLimit(.minutes(1)))
struct RecordedCaptureTests {

    @Test func slowTrackDoesNotHoldCaptureReading() async throws {

        let capture = PullCapture(), track = FakeTrack(heldWrite: 1)
        defer { track.gate.release() }
        let recorded = RecordedCapture(capture: capture, track: track)
        var taken = await capture.handoffs().makeAsyncIterator()
        try await recorded.start()
        await capture.give([tones()[0]])
        await track.gate.waitUntilEntered()
        #expect(await taken.next() == tones()[0])
        await capture.give(Array(tones().dropFirst()))
        #expect(await taken.next() == tones()[1])
        #expect(await taken.next() == tones()[2])
        #expect(track.gate.isHeld)
        #expect(track.pieces.isEmpty)
        track.gate.release()
        try await recorded.stop()
        #expect(track.pieces == tones())
    }

    @Test func capturedTonesAreKeptInOrder() async throws {

        let capture = FakeCapture(), track = FakeTrack()
        let recorded = RecordedCapture(capture: capture, track: track)
        try await recorded.start()
        capture.give(tones())
        try await recorded.stop()
        #expect(track.pieces == tones())
    }

    @Test func stopWaitsForTheHeldLastWrite() async throws {

        try await expectHeldStop(stopFailure: nil, stopEndsInput: true)
    }

    @Test func failedSecondWriteReportsTrackAndStopsCapture() async throws {

        let capture = FakeCapture(), track = FakeTrack(failingWrite: 2)
        defer { capture.finish() }
        let recorded = RecordedCapture(capture: capture, track: track)
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
        #expect(track.pieces == Array(tones().prefix(1)))
        await #expect(throws: Failure.self) { try await recorded.stop() }
        #expect(capture.stops == 1)
    }

    @Test(arguments: [false, true])
    func failedWriteReportsItsFailedStopAsCaptureBeforeAnyRequestedStop(stopEndsInput: Bool) async throws {

        let capture = FakeCapture(stopFailure: .stop, stopEndsInput: stopEndsInput)
        let track = FakeTrack(failingWrite: 1)
        defer { capture.finish() }
        let recorded = RecordedCapture(capture: capture, track: track)
        var failures = recorded.failures.makeAsyncIterator()
        try await recorded.start()
        capture.give([tones()[0]])
        guard case .track(let write) = try #require(await failures.next()) else {
            Issue.record("Expected a track failure"); return
        }
        #expect(write as? Refusal == .write)
        guard case .capture(let stop) = try #require(await failures.next()) else {
            Issue.record("Expected an automatic stop to fail as the capture"); return
        }
        #expect(stop as? Refusal == .stop)
        for _ in 0..<2 {
            await #expect(throws: Failure.self) { try await recorded.stop() }
        }
        #expect(await failures.next() == nil)
        #expect(capture.stops == 1)
    }

    @Test func failedCaptureReportsBeforeStopAndKeepsEveryGivenTone() async throws {

        let capture = FakeCapture(), track = FakeTrack()
        let recorded = RecordedCapture(capture: capture, track: track)
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
        await #expect(throws: Failure.self) { try await recorded.stop() }
        #expect(track.pieces == given)
    }

    @Test func captureFailureIsReportedWhileTheFirstWriteIsHeld() async throws {

        let capture = FakeCapture(), track = FakeTrack(heldWrite: 1)
        defer { track.gate.release(); capture.finish() }
        let recorded = RecordedCapture(capture: capture, track: track)
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
        track.gate.release()
        await #expect(throws: Failure.self) { try await recorded.stop() }
        #expect(track.pieces == tones())
    }

    @Test(arguments: [false, true])
    func failedStopWaitsForEveryGivenTone(stopEndsInput: Bool) async throws {

        try await expectHeldStop(stopFailure: .stop, stopEndsInput: stopEndsInput)
    }

    @Test func refusedStartWritesNothing() async throws {

        let capture = FakeCapture(startFailure: .start), track = FakeTrack()
        let recorded = RecordedCapture(capture: capture, track: track)
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
        #expect(track.pieces.isEmpty)
        #expect(capture.stops == 0)
    }

    @Test func aSecondStartIsRefusedWithoutEndingTheFirst() async throws {

        let capture = FakeCapture(), track = FakeTrack()
        let recorded = RecordedCapture(capture: capture, track: track)
        try await recorded.start()
        await #expect(throws: LifecycleError.alreadyStarted) { try await recorded.start() }
        capture.give(tones())
        try await recorded.stop()
        #expect(track.pieces == tones())
    }

    @Test func stoppingBeforeStartEndsStreamsAndPreventsStarting() async throws {

        let capture = FakeCapture(), track = FakeTrack()
        let recorded = RecordedCapture(capture: capture, track: track)
        try await recorded.stop()
        try await recorded.stop()
        await #expect(throws: LifecycleError.alreadyStarted) { try await recorded.start() }
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
                guard case .stop(let cause) = failure else {
                    Issue.record("Expected a capture stop failure"); return
                }
                #expect(cause as? Refusal == .stop)
            }
        }
        var failures = recorded.failures.makeAsyncIterator()
        let failure = try #require(await failures.next())
        guard case .stop(let cause) = failure else {
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
        let track = FakeTrack(), input = WriteGate()
        let returned = Mutex(false)
        let task = Task {
            let recorded = RecordedCapture(
                capture: capture, track: track, beforeInput: { await input.wait() }
            )
            try await recorded.start()
            capture.give(tones())
            await #expect(throws: Failure.self) { try await recorded.stop() }
            returned.withLock { $0 = true }
            #expect(track.pieces == tones())
        }
        defer { input.release(); capture.finish() }
        await input.waitUntilEntered()
        await capture.waitUntilStopped()
        #expect(input.isHeld)
        #expect(!returned.withLock { $0 })
        #expect(track.pieces.isEmpty)
        input.release()
        try await task.value
        #expect(returned.withLock { $0 })
    }
}

private func expectHeldStop(stopFailure: Refusal?, stopEndsInput: Bool) async throws {

    let capture = FakeCapture(stopFailure: stopFailure, stopEndsInput: stopEndsInput)
    let track = FakeTrack(heldWrite: 2)
    let returned = Mutex(false)
    let task = Task {
        let recorded = RecordedCapture(capture: capture, track: track)
        try await recorded.start()
        let given = Array(tones().prefix(2))
        capture.give(given)
        if stopFailure != nil {
            do {
                try await recorded.stop()
                Issue.record("Expected stop to fail")
            } catch let failure as Failure {
                guard case .stop(let cause) = failure else {
                    Issue.record("Expected a capture stop failure"); return
                }
                #expect(cause as? Refusal == .stop)
            }
        } else {
            try await recorded.stop()
        }
        returned.withLock { $0 = true }
        #expect(track.pieces == given)
    }
    defer { track.gate.release(); capture.finish() }
    await track.gate.waitUntilEntered()
    await capture.waitUntilStopped()
    #expect(track.gate.isHeld)
    #expect(!returned.withLock { $0 })
    #expect(track.pieces == Array(tones().prefix(1)))
    track.gate.release()
    try await task.value
    #expect(returned.withLock { $0 })
}
