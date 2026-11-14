import CallObservation
import SpeakerNaming

private typealias ObservationEvent = Event

/// One recording's tentative row names and the Zoom evidence retained for its after-call pass.
public struct CallNamesState: Equatable, Sendable {

    public var roster: [String]
    public var spoken: [Spoken]
    public var through: Double
    public var rowNames: [Int: String]
    public var participantIDs: [String: String]
    public var participantOrder: [String]
    public var confirmed: Bool
    /// Names seen by the adapter, including those whose observation was too late to accept.
    public var knownNames: [String]
    /// The adapter's sequence includes events that the observation rejected.
    public var sequence: Int
    public var zoomEpoch: Int
    public var zoomSequence: Int
    public var zoomHealth: Health
    public var zoomTimeout: Double

    public init(
        roster: [String] = [], spoken: [Spoken] = [], through: Double = 0,
        rowNames: [Int: String] = [:], participantIDs: [String: String] = [:], participantOrder: [String] = [],
        confirmed: Bool = false, knownNames: [String] = [], sequence: Int = 0,
        zoomEpoch: Int = .min, zoomSequence: Int = 0, zoomHealth: Health = .waiting, zoomTimeout: Double = 3
    ) {
        self.roster = roster; self.spoken = spoken; self.through = through
        self.rowNames = rowNames; self.participantIDs = participantIDs; self.participantOrder = participantOrder
        self.confirmed = confirmed; self.knownNames = knownNames; self.sequence = sequence
        self.zoomEpoch = zoomEpoch; self.zoomSequence = zoomSequence
        self.zoomHealth = zoomHealth; self.zoomTimeout = zoomTimeout
    }

    public struct Spoken: Equatable, Sendable {
        public var name: String
        public var start: Double
        public var end: Double?

        public init(name: String, start: Double, end: Double?) {
            self.name = name; self.start = start; self.end = end
        }
    }
}

public struct Row: Equatable, Sendable {
    public var id: Int
    public var start: Double
    public var end: Double

    public init(id: Int, start: Double, end: Double) {
        self.id = id; self.start = start; self.end = end
    }
}

public enum ZoomChange: Equatable, Sendable {
    case started(String)
    case stopped(String)
    case observed
    case lost
}

public enum CallNamesEvent: Equatable, Sendable {
    case zoom(ZoomChange, at: Double)
    case tick(now: Double)
    case rows([Row])
}

public enum CallNamesEffect: Equatable, Sendable {}

/// Gives rows stable names as Zoom evidence arrives; matching policy is supplied by the caller.
public struct CallNamesReducer: Sendable {
    public typealias State = CallNamesState
    public typealias Event = CallNamesEvent
    public typealias Effect = CallNamesEffect

    private let name: @Sendable (Double, Double, [Participant], [Activity], Double) -> String?

    /// Production supplies `LiveNames.match`; row-name memory belongs only to `State.rowNames`.
    public init(name: @escaping @Sendable (Double, Double, [Participant], [Activity], Double) -> String?) {
        self.name = name
    }

    public func reduce(_ state: State, _ event: Event) -> (State, Effect?) {
        var next = state
        switch event {
        case let .rows(rows):
            let roster = state.roster.map { Participant(id: $0, name: $0) }
            let activities = state.spoken.map {
                Activity(participantID: $0.name, start: $0.start, end: $0.end, uncertainty: 0.5)
            }
            for row in rows.sorted(by: { $0.id < $1.id }) where next.rowNames[row.id] == nil {
                guard let given = name(row.start, row.end, roster, activities, state.through) else { continue }
                next.rowNames[row.id] = given
                if next.participantIDs[given] == nil {
                    next.participantOrder.append(given)
                    next.participantIDs[given] = "z\(next.participantOrder.count)"
                }
            }
            return (next, nil)

        case .zoom(.lost, _):
            return (state, nil)

        case .zoom, .tick:
            var zoom = CallObservation(
                timeout: state.zoomTimeout, epoch: state.zoomEpoch, sequence: state.zoomSequence,
                members: state.roster.map { Member(id: $0, name: $0) },
                intervals: state.spoken.map { Interval(memberID: $0.name, start: $0.start, end: $0.end) },
                through: state.through, health: state.zoomHealth
            )
            switch event {
            case let .zoom(change, time):
                func send(_ kind: ObservationEvent.Kind) {
                    next.sequence += 1
                    zoom.receive(.init(epoch: 1, sequence: next.sequence, time: time, kind: kind))
                }
                switch change {
                case let .started(name):
                    // Zoom exposes display names only, so a name is the participant's identity.
                    if !next.knownNames.contains(name) {
                        next.knownNames.append(name)
                        send(.roster(next.knownNames.map { Member(id: $0, name: $0) }))
                    }
                    send(.speaking(memberID: name, true))
                case let .stopped(name): send(.speaking(memberID: name, false))
                case .observed: send(.heartbeat)
                case .lost: break
                }
            case let .tick(now): zoom.tick(now: now)
            case .rows: break
            }
            next.roster = zoom.members.map(\.name)
            next.spoken = zoom.intervals.map { .init(name: $0.memberID, start: $0.start, end: $0.end) }
            next.through = zoom.through
            next.zoomEpoch = zoom.epoch; next.zoomSequence = zoom.sequence; next.zoomHealth = zoom.health
            return (next, nil)
        }
    }
}
