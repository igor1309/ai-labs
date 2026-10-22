import Foundation

/// Work that writes into call folders (ADR-001 decision 11).
public enum Activity: Sendable, Equatable {
    case recording
    case move
    case delete
}

/// The right to write into call folders, until released.
public struct GateHold: Sendable, Hashable {
    let id: Int
    /// The order in which the gate recorded the request.
    public let sequence: Int
}

/// Why a request was refused: what holds the gate.
public struct GateRefusal: Error, Sendable, Equatable {
    public let holder: Activity
    /// The order in which the gate recorded the request.
    public let sequence: Int
}

/// The one app-wide activity gate. Recording and a folder move exclude each
/// other, a move excludes deletes, and catch-up yields to all of them.
public final class ActivityGate: @unchecked Sendable {
    private typealias Outcome = Result<GateHold, GateRefusal>

    private let lock = NSLock()
    private var sequence = 0
    private var holders: [Int: Activity] = [:]
    private var catchUp: (id: Int, onYield: @Sendable () -> Void)?
    /// Requests waiting for catch-up to yield, in arrival order.
    private var waiting: [(activity: Activity, id: Int, resume: CheckedContinuation<Outcome, Never>)] = []
    private var waitingCatchUp: (id: Int, onYield: @Sendable () -> Void, resume: CheckedContinuation<Void, Never>)?

    public init() {}

    public func request(_ activity: Activity) async throws(GateRefusal) -> GateHold {
        let outcome = await withCheckedContinuation { (resume: CheckedContinuation<Outcome, Never>) in
            lock.lock()
            sequence += 1
            guard let current = catchUp else {
                let outcome = admit(activity, id: sequence)
                lock.unlock()
                resume.resume(returning: outcome)
                return
            }
            // Catch-up holds: ask it to yield and decide on its release.
            waiting.append((activity, sequence, resume))
            lock.unlock()
            current.onYield()
        }
        return try outcome.get()
    }

    /// Catch-up waits while anything else holds the gate. Once it holds,
    /// `onYield` asks it to release for another client.
    public func requestCatchUp(onYield: @escaping @Sendable () -> Void) async -> GateHold {
        let id = lock.withLock {
            sequence += 1
            return sequence
        }
        await withCheckedContinuation { resume in
            lock.lock()
            guard holders.isEmpty else {
                waitingCatchUp = (id, onYield, resume)
                lock.unlock()
                return
            }
            catchUp = (id, onYield)
            lock.unlock()
            resume.resume()
        }
        return GateHold(id: id, sequence: id)
    }

    public func release(_ hold: GateHold) {
        lock.lock()
        var decided: [(CheckedContinuation<Outcome, Never>, Outcome)] = []
        var granted: CheckedContinuation<Void, Never>?
        if catchUp?.id == hold.id {
            catchUp = nil
            decided = waiting.map { ($0.resume, admit($0.activity, id: $0.id)) }
            waiting = []
        } else {
            holders[hold.id] = nil
        }
        if holders.isEmpty, let next = waitingCatchUp {
            waitingCatchUp = nil
            catchUp = (next.id, next.onYield)
            granted = next.resume
        }
        lock.unlock()
        decided.forEach { $0.0.resume(returning: $0.1) }
        granted?.resume()
    }

    /// Grants `activity` or names the holder that excludes it. Called under
    /// the lock.
    private func admit(_ activity: Activity, id: Int) -> Outcome {
        let excluding = holders.sorted { $0.key < $1.key }.first { _, held in
            activity == .move || held == .move
        }
        if let (_, holder) = excluding {
            return .failure(GateRefusal(holder: holder, sequence: id))
        }
        holders[id] = activity
        return .success(GateHold(id: id, sequence: id))
    }
}
