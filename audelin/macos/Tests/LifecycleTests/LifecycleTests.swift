@testable import Compose
import Lifecycle
import Recording
import Synchronization
import Testing

@Suite(.timeLimit(.minutes(1)))
struct LifecycleTests {

    @Test func quitWaitsForEveryBegunSession() async {

        for scenario in [Scenario.active, .queuedStart, .pendingResumes, .pendingCleared] {
            let log = Log()
            let firstEnd = Gate(), secondEnd = Gate()
            let session = Session(log: log, firstEnd: firstEnd, secondEnd: secondEnd)
            let recording = Recording(handler: .init(session: session), initial: .init(automatic: true, missing: []))
            let delivery = Delivery()
            let port = RecordingPort(base: ApplicationRecording(recording: recording), log: log)
            let lifecycle = Lifecycle(delivery: delivery, recording: port, terminate: { log.append("terminate") })

            if scenario != .queuedStart {
                recording.send(.callStarted)
                await wait(recording, phase: .recording, id: 1)
            }
            if scenario == .pendingResumes || scenario == .pendingCleared {
                recording.send(.callEnded)
                await firstEnd.entered()
                recording.send(.callStarted)
                #expect(await recording.snapshot().pendingCall)
            }

            let quit = Task { await lifecycle.quit() }
            await delivery.gate.entered()
            #expect(log.values.filter { $0 == "stop" }.isEmpty)
            if scenario == .queuedStart {
                // Delivery already accepted this start; quit must drain it with the stop.
                recording.send(.callStarted)
            }
            if scenario == .pendingResumes {
                await firstEnd.release()
                await wait(recording, phase: .recording, id: 2)
            }
            await delivery.gate.release()

            await port.drainGate.entered()
            #expect(log.values.contains("stop"))
            #expect(!(await recording.snapshot().pendingCall))
            #expect(!log.values.contains("observe"))
            await port.drainGate.release()
            await port.observeGate.entered()
            #expect(!log.values.contains("end delivery"))
            #expect(!log.values.contains("terminate"))

            // The subscribed stream retains cleanup's transition while consumption is held.
            if scenario == .pendingResumes {
                await secondEnd.entered()
                #expect(!log.values.contains("end 2"))
                await secondEnd.release()
            } else {
                await firstEnd.entered()
                #expect(!log.values.contains("end 1"))
                await firstEnd.release()
            }
            await wait(recording, phase: .idle, id: nil)
            #expect(!log.values.contains("end delivery"))
            await port.observeGate.release()
            await port.endGate.entered()
            #expect(await recording.snapshot().phase == .idle)
            let ids = scenario == .pendingResumes ? [1, 2] : [1]
            #expect(log.values.filter { $0.hasPrefix("begin ") } == ids.map { "begin \($0)" })
            #expect(log.values.filter { $0.hasPrefix("end ") } == ids.map { "end \($0)" })
            #expect(!log.values.contains("terminate"))
            await port.endGate.release()
            await quit.value
            #expect(Array(log.values.suffix(2)) == ["end delivery", "terminate"])
        }
    }

    @Test func quitWhileIdleTerminatesWithoutASession() async {

        let log = Log()
        let firstEnd = Gate(), secondEnd = Gate()
        let recording = Recording(handler: .init(session: Session(log: log, firstEnd: firstEnd, secondEnd: secondEnd)))
        let delivery = Delivery()
        let port = RecordingPort(base: ApplicationRecording(recording: recording), log: log)
        await delivery.gate.release()
        await port.drainGate.release()
        await port.observeGate.release()
        await port.endGate.release()
        await Lifecycle(delivery: delivery, recording: port, terminate: { log.append("terminate") }).quit()
        #expect(log.values == ["stop", "observe", "end delivery", "terminate"])
    }
}

private enum Scenario {

    case active, queuedStart, pendingResumes, pendingCleared
}

private func wait(_ recording: Recording, phase: RecordingState.Phase, id: UInt64?) async {

    for await state in await recording.states() {
        if state.phase == phase && state.session?.id == id { return }
    }
    Issue.record("Recording ended before the expected session state")
}

private struct Delivery: LifecycleDelivery {

    let gate = Gate()
    func stop() async { await gate.wait() }
}

private struct RecordingPort: LifecycleRecording {

    let base: ApplicationRecording
    let log: Log
    let drainGate = Gate(), observeGate = Gate(), endGate = Gate()

    func requestStop() { log.append("stop"); base.requestStop() }

    func drain() async {

        await base.drain()
        await drainGate.wait()
    }

    func states() async -> AsyncStream<LifecycleRecordingState> {

        let states = await base.states()
        log.append("observe")
        await observeGate.wait()
        return states
    }

    func end() async {

        await endGate.wait()
        await base.end()
        log.append("end delivery")
    }
}

private struct Session: RecordingSession {

    let log: Log
    let firstEnd: Gate
    let secondEnd: Gate
    let firstBegan = Gate(), secondBegan = Gate()

    func begin(id: UInt64) async -> RecordingSessionReport {

        log.append("begin \(id)")
        await (id == 1 ? firstBegan : secondBegan).release()
        return .ready
    }

    func end(id: UInt64) async {

        await (id == 1 ? firstBegan : secondBegan).wait()
        await (id == 1 ? firstEnd : secondEnd).wait()
        log.append("end \(id)")
    }
}

private final class Log: Sendable {

    private let storage = Mutex<[String]>([])
    var values: [String] { storage.withLock { $0 } }
    func append(_ value: String) { storage.withLock { $0.append(value) } }
}

private actor Gate {

    private var open = false
    private var reached = false
    private var waiters: [CheckedContinuation<Void, Never>] = []
    private var observers: [CheckedContinuation<Void, Never>] = []

    func wait() async {

        reached = true
        for observer in observers { observer.resume() }
        observers.removeAll()
        if !open { await withCheckedContinuation { waiters.append($0) } }
    }

    func entered() async {

        if !reached { await withCheckedContinuation { observers.append($0) } }
    }

    func release() {

        open = true
        for waiter in waiters { waiter.resume() }
        waiters.removeAll()
    }
}
