/// One call's roster and speaking activity, normalised from a call-app adapter.
///
/// Pure: the adapter stamps each event in call time; this keeps intervals honest when
/// events are lost, reordered, late or stop arriving. Health tells "nobody is speaking"
/// apart from "the app can no longer be observed".
public struct Member: Equatable, Sendable {
    public var id: String
    public var name: String
    public var isLocal: Bool
    public init(id: String, name: String, isLocal: Bool = false) { self.id = id; self.name = name; self.isLocal = isLocal }
}

public struct Event: Equatable, Sendable {
    public enum Kind: Equatable, Sendable {
        case roster([Member])
        case speaking(memberID: String, Bool)
        case heartbeat
    }
    public var epoch: Int
    public var sequence: Int
    public var time: Double
    public var kind: Kind
    public init(epoch: Int, sequence: Int, time: Double, kind: Kind) {
        self.epoch = epoch; self.sequence = sequence; self.time = time; self.kind = kind
    }
}

public struct Interval: Equatable, Sendable {
    public var memberID: String
    public var start: Double
    public var end: Double?
    public init(memberID: String, start: Double, end: Double?) { self.memberID = memberID; self.start = start; self.end = end }
}

public enum Health: Equatable, Sendable { case waiting, healthy, stale }

public struct Snapshot: Equatable, Sendable {
    public var members: [Member]
    public var intervals: [Interval]
    /// Activity is known up to here; after it nobody is known to speak.
    public var through: Double
    public var health: Health
}

public struct CallObservation: Sendable {
    public let timeout: Double
    private var epoch = Int.min
    private var sequence = 0
    private var members: [Member] = []
    private var intervals: [Interval] = []
    private var through = 0.0
    private var health = Health.waiting

    public init(timeout: Double = 3) { self.timeout = timeout }

    public mutating func receive(_ event: Event) {
        guard event.epoch >= epoch else { return }
        if event.epoch > epoch {
            // A restart or rejoin: nothing open survives into the new epoch.
            close(at: through); epoch = event.epoch; sequence = event.sequence - 1
        }
        guard event.sequence > sequence, event.time >= through else { return }
        // A gap may have hidden a "stopped speaking": open intervals end where knowledge ended.
        if event.sequence != sequence + 1 { close(at: through) }
        sequence = event.sequence; through = event.time; health = .healthy
        switch event.kind {
        case .roster(let roster): members = roster
        case .heartbeat: break
        case .speaking(let id, true):
            if !intervals.contains(where: { $0.memberID == id && $0.end == nil }) {
                intervals.append(.init(memberID: id, start: event.time, end: nil))
            }
        case .speaking(let id, false):
            for index in intervals.indices where intervals[index].memberID == id && intervals[index].end == nil {
                intervals[index].end = event.time
            }
        }
    }

    /// Advances the clock; silence beyond the timeout makes the source stale.
    public mutating func tick(now: Double) {
        guard health == .healthy, now - through > timeout else { return }
        close(at: through); health = .stale
    }

    public var snapshot: Snapshot { .init(members: members, intervals: intervals, through: through, health: health) }

    private mutating func close(at time: Double) {
        for index in intervals.indices where intervals[index].end == nil {
            intervals[index].end = time
            if time <= intervals[index].start { intervals[index].end = intervals[index].start }
        }
        intervals.removeAll { $0.end == $0.start }
    }
}
