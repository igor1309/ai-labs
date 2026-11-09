import Observation
import Composer
import Foundation
import Preferences
import Recording
import Synchronization
import Testing

/// Quitting through the composed menu: the captures, the detection source and
/// the terminate closure are all that is seen.
@MainActor
@Suite(.timeLimit(.minutes(1)))
struct QuitTests {

    @Test func quitWaitsForTheActiveSessionBeforeTerminating() async throws {

        let binding = CallBinding(fails: false, input: true), stop = DrainGate(), terminated = Values<Bool>()
        defer { stop.release() }
        try await withComposition(preferences: automatic, configure: { boundary in
            boundary.processes = FixtureProcesses(binding: binding)
            holdStop(of: &boundary, on: stop)
        }, terminate: { terminated.append(true) }) { rig in
            _ = try await rig.state { $0.phase == .recording }
            let quit = Task { await rig.menu.perform(.quit) }
            await stop.waitUntilEntered()
            #expect(terminated.all.isEmpty)
            stop.release()
            await quit.value
            #expect(terminated.all == [true])
            #expect(rig.microphone.starts.all == [true])
            #expect(rig.microphone.stops.all == [true])
            #expect(rig.call.stops.all == [true])
        }
    }

    /// A call that came back while the first session was still ending would
    /// start a second session; quitting clears it instead.
    @Test func quitClearsACallWaitingForTheEndingSession() async throws {

        let binding = CallBinding(fails: false, input: false), deadlines = FixtureDeadlines()
        let stop = DrainGate(), terminated = Values<Bool>()
        defer { stop.release(); deadlines.end() }
        try await withComposition(preferences: automatic, configure: { boundary in
            boundary.processes = FixtureProcesses(binding: binding)
            boundary.time = deadlines.time(over: boundary.time)
            holdStop(of: &boundary, on: stop)
        }, terminate: { terminated.append(true) }) { rig in
            try await reachAWaitingCall(rig, binding, deadlines, stop)

            let quit = Task { await rig.menu.perform(.quit) }
            _ = try await rig.state { !$0.pendingCall }
            #expect(terminated.all.isEmpty)
            stop.release()
            await quit.value
            #expect(terminated.all == [true])
            #expect(rig.microphone.starts.all == [true])
            #expect(rig.microphone.stops.all == [true])
        }
    }

    @Test func quitEndsTheSessionAWaitingCallResumedInto() async throws {

        let binding = CallBinding(fails: false, input: false), deadlines = FixtureDeadlines()
        let stop = DrainGate(), terminated = Values<Bool>()
        defer { stop.release(); deadlines.end() }
        try await withComposition(preferences: automatic, configure: { boundary in
            boundary.processes = FixtureProcesses(binding: binding)
            boundary.time = deadlines.time(over: boundary.time)
            holdStop(of: &boundary, on: stop)
        }, terminate: { terminated.append(true) }) { rig in
            try await reachAWaitingCall(rig, binding, deadlines, stop)
            stop.release()
            let resumed = try await rig.state { $0.phase == .recording && !$0.pendingCall }
            #expect(resumed.callOn)
            #expect(rig.microphone.starts.all == [true, true])

            await rig.menu.perform(.quit)
            #expect(terminated.all == [true])
            #expect(rig.microphone.starts.all == [true, true])
            #expect(rig.microphone.stops.all == [true, true])
        }
    }

    /// A start detection has already accepted is settled before the recording
    /// is asked to stop, so nothing can begin behind the stop.
    @Test func quitStopsDetectionBeforeStoppingTheRecording() async throws {

        let binding = CallBinding(fails: false, input: false), held = DrainGate()
        let holding = Mutex(false), order = Values<String>(), terminated = Values<Bool>()
        defer { held.release() }
        try await withComposition(configure: { boundary in
            boundary.processes = FixtureProcesses(binding: binding)
            boundary.access = ComposerAccess(refresh: {
                if holding.withLock({ $0 }) { await held.wait() }
                return true
            }, reserve: { true }, release: {}, states: { AsyncStream { $0.yield(true); $0.finish() } }, invalidate: {})
            let microphone = boundary.microphone
            boundary.microphone = FixtureMicrophone {
                let started = try await microphone.start()
                return StartedCapture(stream: started.stream, stop: {
                    order.append("recording stopped")
                    try await started.stop()
                })
            }
        }, terminate: { terminated.append(true) }) { rig in
            try await rig.start()
            holding.withLock { $0 = true }
            binding.setInput(true)
            await held.waitUntilEntered()
            let quit = Task { await rig.menu.perform(.quit) }
            for await quitting in Observations({ rig.menu.quitting }) where quitting { break }
            order.append("detection released")
            held.release()
            await quit.value
            #expect(order.all == ["detection released", "recording stopped"])
            #expect(terminated.all == [true])
            #expect(rig.microphone.starts.all == [true])
        }
    }

    @Test func quitWhileIdleTerminatesWithoutASession() async throws {

        let terminated = Values<Bool>()
        try await withComposition(terminate: { terminated.append(true) }) { rig in
            await rig.menu.perform(.quit)
            #expect(terminated.all == [true])
            #expect(rig.microphone.starts.all.isEmpty && rig.call.starts.all.isEmpty)
        }
    }
}

private func automatic(_ root: URL) -> Preferences { .init(automaticRecording: true, liveText: false, callsFolder: root) }

/// Ends a detected call with its session's stop held, and brings the call back while it is.
@MainActor
private func reachAWaitingCall(_ rig: ComposeFixture, _ binding: CallBinding, _ deadlines: FixtureDeadlines, _ stop: DrainGate) async throws {

    binding.setInput(true)
    _ = try await rig.state { $0.phase == .recording }
    binding.setInput(false)
    await deadlines.fire()
    await stop.waitUntilEntered()
    binding.setInput(true)
    _ = try await rig.state { $0.pendingCall }
}

/// Holds the microphone's stop, and so the session's end, until the gate opens.
private func holdStop(of boundary: inout ComposerBoundary, on gate: DrainGate) {

    let microphone = boundary.microphone
    boundary.microphone = FixtureMicrophone {
        let started = try await microphone.start()
        return StartedCapture(stream: started.stream, stop: {
            await gate.wait()
            try await started.stop()
        })
    }
}
