import Foundation
import Testing
@testable import CallDomain

/// Activity gate QA scenarios (`docs/spec/activity-gate/QA.md`).
@Suite struct ActivityGateTests {
    @Test func s1AFreeGate() async {
        let gate = ActivityGate()

        await #expect(throws: Never.self) { try await gate.request(.recording) }
    }

    @Test func s2ARecordingRefusesAMove() async throws {
        let gate = ActivityGate()
        _ = try await gate.request(.recording)

        await #expect(throws: GateRefusal.self) { try await gate.request(.move) }
        #expect(await refusal(gate, .move)?.holder == .recording)
    }

    @Test func s3AMoveRefusesARecording() async throws {
        let gate = ActivityGate()
        _ = try await gate.request(.move)

        #expect(await refusal(gate, .recording)?.holder == .move)
    }

    @Test(arguments: [Activity.recording, .move, .delete])
    func s4CatchUpYields(to activity: Activity) async throws {
        let gate = ActivityGate()
        let yielded = Flag()
        let catchUp = await gate.requestCatchUp { yielded.set() }
        let granted = Flag()

        let request = Task { _ = try await gate.request(activity); granted.set() }
        #expect(await eventually { yielded.isSet }, "catch-up got no yield")
        try await settle()
        #expect(!granted.isSet, "granted before catch-up released")

        gate.release(catchUp)
        try await request.value
        #expect(granted.isSet)
    }

    @Test func s5Release() async throws {
        let gate = ActivityGate()
        let recording = try await gate.request(.recording)
        let catchUp = waitingCatchUp(gate)
        try await settle()
        #expect(!catchUp.granted.isSet, "catch-up granted while a recording holds")

        gate.release(recording)

        _ = await catchUp.task.value
        #expect(catchUp.granted.isSet)
    }

    @Test func s6TwoRequestsAtOnce() async {
        for _ in 0..<10_000 {
            let gate = ActivityGate()
            async let recording = outcome(gate, .recording)
            async let move = outcome(gate, .move)
            let (r, m) = await (recording, move)

            switch (r, m) {
            case let (.success(hold), .failure(refusal)):
                #expect(refusal.holder == .recording && hold.sequence < refusal.sequence)
            case let (.failure(refusal), .success(hold)):
                #expect(refusal.holder == .move && hold.sequence < refusal.sequence)
            default:
                Issue.record("expected exactly one grant, got \(r) and \(m)")
                return
            }
        }
    }

    @Test func s7ADeleteDuringARecording() async throws {
        let gate = ActivityGate()
        let recording = try await gate.request(.recording)

        await #expect(throws: Never.self) { try await gate.request(.delete) }
        gate.release(recording)
    }

    @Test func s8AMoveRefusesADelete() async throws {
        let gate = ActivityGate()
        _ = try await gate.request(.move)

        #expect(await refusal(gate, .delete)?.holder == .move)
    }

    @Test func s9ADeleteReleasesDuringARecording() async throws {
        let gate = ActivityGate()
        let recording = try await gate.request(.recording)
        let delete = try await gate.request(.delete)
        let catchUp = waitingCatchUp(gate)

        gate.release(delete)
        try await settle()
        #expect(!catchUp.granted.isSet, "catch-up granted while a recording holds")

        gate.release(recording)
        _ = await catchUp.task.value
        #expect(catchUp.granted.isSet)
    }

    @Test func s10CatchUpWaitsOutAMove() async throws {
        let gate = ActivityGate()
        let move = try await gate.request(.move)
        let catchUp = waitingCatchUp(gate)
        try await settle()
        #expect(!catchUp.granted.isSet, "catch-up granted while a move holds")

        gate.release(move)
        _ = await catchUp.task.value
        #expect(catchUp.granted.isSet)
    }
}

// MARK: - Helpers

private final class Flag: @unchecked Sendable {
    private let lock = NSLock()
    private var value = false
    var isSet: Bool { lock.withLock { value } }
    func set() { lock.withLock { value = true } }
}

private func refusal(_ gate: ActivityGate, _ activity: Activity) async -> GateRefusal? {
    if case let .failure(refusal) = await outcome(gate, activity) { return refusal }
    return nil
}

private func outcome(_ gate: ActivityGate, _ activity: Activity) async -> Result<GateHold, GateRefusal> {
    do { return .success(try await gate.request(activity)) } catch { return .failure(error) }
}

private func waitingCatchUp(_ gate: ActivityGate) -> (task: Task<GateHold, Never>, granted: Flag) {
    let granted = Flag()
    let task = Task {
        let hold = await gate.requestCatchUp {}
        granted.set()
        return hold
    }
    return (task, granted)
}

/// Lets other tasks run long enough to act on what they were given.
private func settle() async throws { try await Task.sleep(for: .milliseconds(50)) }

private func eventually(_ condition: () -> Bool) async -> Bool {
    for _ in 0..<200 where !condition() { try? await Task.sleep(for: .milliseconds(5)) }
    return condition()
}
