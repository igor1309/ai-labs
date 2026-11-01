@testable import Composer
import Lifecycle
import Recording
import Synchronization
import Testing

/// Runs the application's quit effects in the reducer's order against a real recording.
@Suite(.timeLimit(.minutes(1)))
struct QuitTests {

    @Test func quitWaitsForEveryBegunSession() async {

        for scenario in [Scenario.active, .queuedStart, .pendingResumes, .pendingCleared] {
            let log = Log()
            let firstEnd = Gate(), secondEnd = Gate()
            let session = Session(log: log, firstEnd: firstEnd, secondEnd: secondEnd)
            let recording = await composedRecording(session: session, initial: .init(automatic: true, missing: []))
            let delivery = Delivery()
            let port = RecordingPort(base: ApplicationRecording(recording: recording), log: log)
            let handler = LifecycleEffectHandler(delivery: delivery, recording: port, terminate: { log.append("terminate") })

            if scenario != .queuedStart {
                await recording.send(.callStarted)
                await wait(recording, phase: .recording, id: 1)
            }
            if scenario == .pendingResumes || scenario == .pendingCleared {
                await recording.send(.callEnded)
                await firstEnd.entered()
                await recording.send(.callStarted)
                #expect(await recording.state().pendingCall)
            }

            let quit = Task { await runQuit(handler) }
            await delivery.gate.entered()
            #expect(log.values.filter { $0 == "stop" }.isEmpty)
            if scenario == .queuedStart {
                // Delivery already accepted this start; quit must drain it with the stop.
                await recording.send(.callStarted)
            }
            if scenario == .pendingResumes {
                await firstEnd.release()
                await wait(recording, phase: .recording, id: 2)
            }
            await delivery.gate.release()

            await port.drainGate.entered()
            #expect(log.values.contains("stop"))
            #expect(!(await recording.state().pendingCall))
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
            #expect(await recording.state().phase == .idle)
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
        let recording = await composedRecording(session: Session(log: log, firstEnd: firstEnd, secondEnd: secondEnd))
        let delivery = Delivery()
        let port = RecordingPort(base: ApplicationRecording(recording: recording), log: log)
        await delivery.gate.release()
        await port.drainGate.release()
        await port.observeGate.release()
        await port.endGate.release()
        await runQuit(LifecycleEffectHandler(delivery: delivery, recording: port, terminate: { log.append("terminate") }))
        #expect(log.values == ["stop", "observe", "end delivery", "terminate"])
    }
}

/// Feeds each effect the reducer asks for to the handler, and its event back, until no effect is left.
func runQuit(_ handler: LifecycleEffectHandler) async {

    var (state, effect) = LifecycleReducer.reduce(.running, .quit)
    while let next = effect {
        var events: [LifecycleEvent] = []
        for await event in handler.handle(next) { events.append(event) }
        #expect(events.count == 1, "\(next)")
        guard let event = events.first else { return }
        (state, effect) = LifecycleReducer.reduce(state, event)
    }
    #expect(state == .terminated)
}

private enum Scenario {

    case active, queuedStart, pendingResumes, pendingCleared
}

private func wait(_ recording: RecordingInputs, phase: RecordingState.Phase, id: UInt64?) async {

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
