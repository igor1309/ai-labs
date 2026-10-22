import Foundation
import Testing
@testable import CallDomain

/// Activity gate QA scenarios (`docs/spec/activity-gate/QA.md`).
/// No test sleeps to show that something did not happen: a request is
/// registered when it is made, so its state can be read at once.
@Suite(.timeLimit(.minutes(1))) struct ActivityGateTests {
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
        let yielded = Signal()
        let catchUp = gate.requestCatchUp { yielded.fire() }
        #expect(catchUp.isGranted, "catch-up not granted on a free gate")
        let granted = Flag()

        let request = Task { _ = try await gate.request(activity); granted.set() }
        await yielded.wait()
        // The request waits on catch-up's release, which has not happened.
        #expect(!granted.isSet, "granted before catch-up released")

        gate.release(await catchUp.hold())
        try await request.value
        #expect(granted.isSet)
    }

    @Test func s5Release() async throws {
        let gate = ActivityGate()
        let recording = try await gate.request(.recording)
        let catchUp = gate.requestCatchUp {}
        #expect(!catchUp.isGranted, "catch-up granted while a recording holds")

        gate.release(recording)

        #expect(catchUp.isGranted)
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
        let catchUp = gate.requestCatchUp {}

        gate.release(delete)
        #expect(!catchUp.isGranted, "catch-up granted while a recording holds")

        gate.release(recording)
        #expect(catchUp.isGranted)
    }

    @Test func s10CatchUpWaitsOutAMove() async throws {
        let gate = ActivityGate()
        let move = try await gate.request(.move)
        let catchUp = gate.requestCatchUp {}
        #expect(!catchUp.isGranted, "catch-up granted while a move holds")

        gate.release(move)
        #expect(catchUp.isGranted)
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

/// Something that happens once; tests wait for it rather than poll.
private final class Signal: @unchecked Sendable {
    private let lock = NSLock()
    private var fired = false
    private var waiting: [CheckedContinuation<Void, Never>] = []

    func fire() {
        let waiting = lock.withLock {
            fired = true
            defer { self.waiting = [] }
            return self.waiting
        }
        waiting.forEach { $0.resume() }
    }

    func wait() async {
        await withCheckedContinuation { resume in
            lock.lock()
            if fired {
                lock.unlock()
                resume.resume()
            } else {
                waiting.append(resume)
                lock.unlock()
            }
        }
    }
}
