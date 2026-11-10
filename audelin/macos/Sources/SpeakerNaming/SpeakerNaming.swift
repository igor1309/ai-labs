/// Names diarized speaker clusters from a call app's active-speaker intervals.
///
/// Pure and replayable: every input replaces earlier input with the same identity,
/// so replaying a snapshot never adds a vote. All times are call time in seconds.
public struct Participant: Equatable, Sendable {
    public var id: String
    public var name: String
    public var isLocal: Bool
    public init(id: String, name: String, isLocal: Bool = false) { self.id = id; self.name = name; self.isLocal = isLocal }
}

/// One participant's speaking interval as the call app showed it; `end == nil` while still speaking.
public struct Activity: Equatable, Sendable {
    public var participantID: String
    public var start: Double
    public var end: Double?
    /// How far each edge may be off (polling, delivery, the app's own debounce).
    public var uncertainty: Double
    public init(participantID: String, start: Double, end: Double?, uncertainty: Double = 0) {
        self.participantID = participantID; self.start = start; self.end = end; self.uncertainty = uncertainty
    }
}

/// One diarized turn on the call track; a later revision with the same `id` replaces it.
public struct Turn: Equatable, Sendable {
    public var id: String
    public var cluster: String
    public var start: Double
    public var end: Double
    public var overlapped: Bool
    public init(id: String, cluster: String, start: Double, end: Double, overlapped: Bool = false) {
        self.id = id; self.cluster = cluster; self.start = start; self.end = end; self.overlapped = overlapped
    }
}

/// Starting thresholds, unvalidated until recorded calls recalibrate them.
public struct Policy: Equatable, Sendable {
    public var window = 30.0
    public var candidateSeconds = 1.0
    public var confirmSeconds = 4.0
    public var confirmTurns = 2
    public var support = 0.85
    public var lead = 0.25
    public var disputeSeconds = 2.0
    public var disputeTurns = 2
    public var turnCap = 3.0
    public init() {}
}

public enum Assignment: Equatable, Sendable {
    case unknown
    case candidate(participantID: String)
    case confirmed(participantID: String)
    case disputed
}

public struct SpeakerNaming: Sendable {
    public let policy: Policy
    private var roster: [String: Participant] = [:]
    private var activities: [Activity] = []
    private var turns: [String: Turn] = [:]
    private var observedThrough = 0.0
    private var states: [String: Assignment] = [:]
    private var disputedAt: [String: Double] = [:]

    public init(policy: Policy = Policy()) { self.policy = policy }

    /// Replaces the roster; a renamed participant keeps its identity.
    public mutating func observe(roster: [Participant]) {
        self.roster = Dictionary(roster.map { ($0.id, $0) }, uniquingKeysWith: { $1 })
    }
    /// Replaces the activity history, valid through `through`: after it nobody is known to speak.
    public mutating func observe(activities: [Activity], through: Double) {
        self.activities = activities
        observedThrough = max(observedThrough, through)
    }
    public mutating func observe(turn: Turn) { turns[turn.id] = turn }
    /// A cluster split, merge or reset: its earlier name must not carry over.
    public mutating func reset(cluster: String) {
        turns = turns.filter { $0.value.cluster != cluster }
        states[cluster] = nil; disputedAt[cluster] = nil
    }

    public func assignment(of cluster: String) -> Assignment { states[cluster] ?? .unknown }
    /// The name to show, only once confirmed; otherwise the generic label stays.
    public func name(of cluster: String) -> String? {
        guard case .confirmed(let id) = assignment(of: cluster) else { return nil }
        return roster[id]?.name
    }

    /// Re-evaluates every cluster against the evidence; call after a batch of observations.
    public mutating func advance() {
        let latest = turns.values.map(\.end).max() ?? 0
        for cluster in Set(turns.values.map(\.cluster)) {
            let state = assignment(of: cluster)
            let since = state == .disputed ? disputedAt[cluster] ?? 0 : latest - policy.window
            let votes = evidence(cluster: cluster, since: since)
            let ranked = votes.sorted { $0.value.seconds > $1.value.seconds }
            switch state {
            case .confirmed(let id):
                if ranked.contains(where: { $0.key != id && $0.value.seconds >= policy.disputeSeconds && $0.value.turns >= policy.disputeTurns }) {
                    states[cluster] = .disputed; disputedAt[cluster] = latest
                }
            case .unknown, .candidate, .disputed:
                if let best = ranked.first, confirms(best.value, of: ranked) {
                    states[cluster] = .confirmed(participantID: best.key)
                } else if state != .disputed, let best = ranked.first, best.value.seconds >= policy.candidateSeconds {
                    states[cluster] = .candidate(participantID: best.key)
                }
            }
        }
    }

    private struct Vote { var seconds = 0.0; var turns = 0 }

    private func confirms(_ best: Vote, of ranked: [(key: String, value: Vote)]) -> Bool {
        let total = ranked.reduce(0) { $0 + $1.value.seconds }
        let runnerUp = ranked.dropFirst().first?.value.seconds ?? 0
        return best.seconds >= policy.confirmSeconds && best.turns >= policy.confirmTurns
            && best.seconds / total >= policy.support && (best.seconds - runnerUp) / total >= policy.lead
    }

    /// Exclusive voiced overlap: time inside a clean turn where exactly one remote participant
    /// was shown speaking, with uncertain edges trimmed and each turn's influence capped.
    private func evidence(cluster: String, since: Double) -> [String: Vote] {
        let speaking = activities.compactMap { activity -> (String, Double, Double)? in
            guard roster[activity.participantID] != nil else { return nil }
            let start = activity.start + activity.uncertainty
            let end = min(activity.end ?? observedThrough, observedThrough) - activity.uncertainty
            return end > start ? (activity.participantID, start, end) : nil
        }
        var votes: [String: Vote] = [:]
        for turn in turns.values where turn.cluster == cluster && !turn.overlapped && turn.end > since {
            let lower = max(turn.start, since), upper = min(turn.end, observedThrough)
            guard upper > lower else { continue }
            let edges = Set([lower, upper] + speaking.flatMap { [$0.1, $0.2] }.filter { $0 > lower && $0 < upper }).sorted()
            var perTurn: [String: Double] = [:]
            for (a, b) in zip(edges, edges.dropFirst()) {
                let mid = (a + b) / 2
                let active = Set(speaking.filter { $0.1 <= mid && mid < $0.2 }.map(\.0))
                // The local participant counts as a speaker so echo or crosstalk is never evidence.
                guard active.count == 1, let id = active.first, roster[id]?.isLocal == false else { continue }
                perTurn[id, default: 0] += b - a
            }
            for (id, seconds) in perTurn {
                votes[id, default: Vote()].seconds += min(seconds, policy.turnCap)
                votes[id, default: Vote()].turns += 1
            }
        }
        return votes
    }
}
