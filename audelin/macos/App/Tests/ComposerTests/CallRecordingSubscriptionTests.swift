import Composer
import Foundation
import CoreAudioProcesses
import MenuBar
import Observation
import Preferences
import Recording
import Synchronization
import Testing

/// Detection reaches the recording through the composed application: the process
/// source is the only input, and the menu, the log and the captures are what is seen.
@MainActor
@Suite(.timeLimit(.minutes(1)))
struct CallRecordingSubscriptionTests {

    @Test func startsAndEndsArriveInOrderOnce() async throws {

        let binding = CallBinding(fails: false, input: false), deadlines = FixtureDeadlines()
        defer { deadlines.end() }
        try await withComposition(preferences: automatic, configure: detecting(binding, deadlines)) { rig in
            try await oneCall(id: 1, rig, binding, deadlines)
            try await oneCall(id: 2, rig, binding, deadlines)
            #expect(rig.microphone.starts.all == [true, true])
            #expect(rig.microphone.stops.all == [true, true])
            #expect(calls(rig.log) == [
                .init(category: .calls, message: "started app=us.zoom.xos"), .init(category: .calls, message: "ended"),
                .init(category: .calls, message: "started app=us.zoom.xos"), .init(category: .calls, message: "ended"),
            ])
        }
    }

    @Test func failureDuringCallEndsRecordingOnce() async throws {

        let binding = CallBinding(fails: false, input: false)
        try await withComposition(preferences: automatic, configure: { $0.processes = FixtureProcesses(binding: binding) }) { rig in
            binding.setInput(true)
            _ = try await rig.state { $0.phase == .recording }
            binding.fail()
            let ended = try await rig.state { $0.phase == .idle && !$0.callOn }
            #expect(ended.session == nil)
            #expect(ended.lastSessionID == 1)
            await stateLine(rig, "Наблюдение за звонками остановлено: failed")
            #expect(rig.microphone.starts.all == [true])
            #expect(rig.microphone.stops.all == [true])
            #expect(calls(rig.log) == [
                .init(category: .calls, message: "started app=us.zoom.xos"),
                .init(category: .calls, message: "detection failed", error: "failed"),
                .init(category: .calls, message: "ended (detection stream ended)"),
            ])
        }
    }

    @Test func failureWithoutADetectedCallSendsNothing() async throws {

        let binding = CallBinding(fails: false, input: false)
        try await withComposition(preferences: automatic, configure: { $0.processes = FixtureProcesses(binding: binding) }) { rig in
            let before = try await rig.state { $0.phase == .idle && $0.missing.isEmpty }
            binding.fail()
            await stateLine(rig, "Наблюдение за звонками остановлено: failed")
            #expect(try await rig.state { _ in true } == before)
            #expect(calls(rig.log) == [.init(category: .calls, message: "detection failed", error: "failed")])
            #expect(rig.microphone.starts.all.isEmpty && rig.call.starts.all.isEmpty)
        }
    }

    @Test func aCallAlreadyOnAtLaunchIsForwarded() async throws {

        let binding = CallBinding(fails: false, input: true)
        try await withComposition(configure: { $0.processes = FixtureProcesses(binding: binding) }) { rig in
            let state = try await rig.state { $0.callOn }
            #expect(state.phase == .idle && state.session == nil)
            #expect(calls(rig.log) == [.init(category: .calls, message: "started app=us.zoom.xos")])
            #expect(rig.microphone.starts.all.isEmpty)
        }
    }

    /// A call that starts while the conditions are being read is not sent once
    /// quitting has cancelled detection, even though the read finishes after.
    @Test func quitDuringTheRefreshSendsNoStart() async throws {

        let binding = CallBinding(fails: false, input: false)
        let refreshes = Mutex(0), held = DrainGate()
        defer { held.release() }
        try await withComposition(preferences: automatic, configure: { boundary in
            boundary.processes = FixtureProcesses(binding: binding)
            boundary.access = ComposerAccess(refresh: {
                // The launch reads the conditions once; the call's refresh is the next.
                guard refreshes.withLock({ $0 += 1; return $0 }) > 1 else { return true }
                await withTaskCancellationHandler { await held.wait() } onCancel: { held.release() }
                return true
            }, reserve: { true }, release: {}, states: { AsyncStream { $0.yield(true); $0.finish() } }, invalidate: {})
        }) { rig in
            _ = try await rig.state { $0.phase == .idle && $0.missing.isEmpty }
            binding.setInput(true)
            await held.waitUntilEntered()
            await rig.menu.perform(.quit)
            #expect(rig.microphone.starts.all.isEmpty && rig.call.starts.all.isEmpty)
            #expect(!rig.menu.state.callOn)
            #expect(rig.log.entries.all.contains { $0 == .init(category: .calls, message: "started app=us.zoom.xos") })
        }
    }
}

private func automatic(_ root: URL) -> Preferences { .init(automaticRecording: true, liveText: false, callsFolder: root) }

private func detecting(_ binding: CallBinding, _ deadlines: FixtureDeadlines) -> (inout ComposerBoundary) -> Void {
    { boundary in
        boundary.processes = FixtureProcesses(binding: binding)
        boundary.time = deadlines.time(over: boundary.time)
    }
}

@MainActor
private func oneCall(id: UInt64, _ rig: ComposeFixture, _ binding: CallBinding, _ deadlines: FixtureDeadlines) async throws {
    binding.setInput(true)
    let running = try await rig.state { $0.phase == .recording }
    #expect(running.callOn)
    #expect(running.session == .init(id: id, origin: .call))
    binding.setInput(false)
    await deadlines.fire()
    let ended = try await rig.state { $0.phase == .idle && !$0.callOn }
    #expect(ended.lastSessionID == id)
}

private func calls(_ log: FixtureLog) -> [LogEntry] { log.entries.all.filter { $0.category == .calls } }

@MainActor
private func stateLine(_ rig: ComposeFixture, _ line: String) async {
    for await menu in Observations({ rig.menu.menu }) where menu.entries.contains(.stateLine(line)) { return }
}

final class CallBinding: ProcessBinding {

    private struct State {

        var fails: Bool
        var input: Bool
        var listeners: [Int: @Sendable () -> Void] = [:]
        var nextListener = 0
    }
    private let state: Mutex<State>

    init(fails: Bool, input: Bool = true) {

        state = Mutex(State(fails: fails, input: input))
    }

    var activeListeners: Int { state.withLock { $0.listeners.count } }

    func queuedNotifications() -> [@Sendable () -> Void] {

        state.withLock { Array($0.listeners.values) }
    }

    func setInput(_ input: Bool) {

        state.withLock { $0.input = input }
        queuedNotifications().forEach { $0() }
    }

    func fail() {

        state.withLock { $0.fails = true }
        queuedNotifications().forEach { $0() }
    }

    func processObjects() throws -> [ProcessObject] {

        if state.withLock({ $0.fails }) { throw ScriptFailure.failed }
        return [1]
    }

    func pid(of object: ProcessObject) -> Int32? { 42 }
    func bundleID(of object: ProcessObject) -> String? { "us.zoom.xos" }
    func name(of object: ProcessObject) -> String { "meeting" }
    func isRunningInput(_ object: ProcessObject) -> Bool { state.withLock { $0.input } }
    func onProcessListChange(_ changed: @escaping @Sendable () -> Void) throws -> Cancellation { listen(changed) }
    func onProcessChange(_ object: ProcessObject, _ changed: @escaping @Sendable () -> Void) throws -> Cancellation { listen(changed) }

    private func listen(_ changed: @escaping @Sendable () -> Void) -> Cancellation {

        let id = state.withLock {
            $0.nextListener += 1
            $0.listeners[$0.nextListener] = changed
            return $0.nextListener
        }
        return Cancellation { [weak self] in self?.state.withLock { _ = $0.listeners.removeValue(forKey: id) } }
    }
}
