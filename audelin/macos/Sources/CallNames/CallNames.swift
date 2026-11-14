import CallObservation
import SpeakerNaming

private typealias ObservationEvent = Event

/// One recording's tentative row names and the selected evidence retained for its after-call pass.
public struct CallNamesState: Equatable, Sendable {

    public var roster: [String]
    public var spoken: [Spoken]
    public var through: Double
    public var rowNames: [Int: String]
    public var participantIDs: [String: String]
    public var participantOrder: [String]
    public var confirmed: Bool
    /// Whether the call app is being watched for this recording.
    public var observation: Observation
    /// Names seen by the adapter, including those whose observation was too late to accept.
    public var knownNames: [String]
    /// The adapter's sequence includes events that the observation rejected.
    public var sequence: Int
    public var zoom: Evidence
    public var browser: Evidence
    public var browserConnections: Set<Int>

    public init(
        roster: [String] = [], spoken: [Spoken] = [], through: Double = 0,
        rowNames: [Int: String] = [:], participantIDs: [String: String] = [:], participantOrder: [String] = [],
        confirmed: Bool = false, observation: Observation = .idle, knownNames: [String] = [], sequence: Int = 0,
        zoom: Evidence = Evidence(), browser: Evidence = Evidence(), browserConnections: Set<Int> = []
    ) {
        self.roster = roster; self.spoken = spoken; self.through = through
        self.rowNames = rowNames; self.participantIDs = participantIDs; self.participantOrder = participantOrder
        self.confirmed = confirmed; self.observation = observation; self.knownNames = knownNames; self.sequence = sequence
        self.zoom = zoom; self.browser = browser; self.browserConnections = browserConnections
    }

    public struct Evidence: Equatable, Sendable {
        public var members: [Member]
        public var intervals: [Interval]
        public var through: Double
        public var epoch: Int
        public var sequence: Int
        public var health: Health
        public var timeout: Double

        public init(
            members: [Member] = [], intervals: [Interval] = [], through: Double = 0,
            epoch: Int = .min, sequence: Int = 0, health: Health = .waiting, timeout: Double = 3
        ) {
            self.members = members; self.intervals = intervals; self.through = through
            self.epoch = epoch; self.sequence = sequence; self.health = health; self.timeout = timeout
        }
    }

    /// These names with the after-call result: `confirmed` maps rows to names and replaces
    /// every live one; a name not seen before gets the next participant ID, in name order.
    public func confirming(_ confirmed: [Int: String]) -> CallNamesState {
        var next = self
        next.rowNames = confirmed
        for name in confirmed.values.sorted() where next.participantIDs[name] == nil {
            next.participantOrder.append(name)
            next.participantIDs[name] = "z\(next.participantOrder.count)"
        }
        next.confirmed = true
        return next
    }

    public enum Observation: Equatable, Sendable {
        case idle
        case observing
        /// Stop was asked; the sources are being closed.
        case stopping
        case stopped
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
    case browser(Event)
    case browserConnected(Int)
    case browserDisconnected(Int)
    case rows([Row], now: Double)
    /// The after-call pass's speaker turns over the closed call, with its remote rows.
    case diarized([DiarizedTurn], rows: [Row])
    /// The recording started: watch the call app.
    case start
    /// The recording ended: stop watching; the names stay.
    case stop
    case observationStopped
}

public enum CallNamesEffect: Equatable, Sendable {
    /// Watch every call-app source, delivering what each observes.
    case observe
    /// Close every call-app source.
    case stopObserving
}

/// Gives rows stable names from browser or Zoom evidence; matching policy is supplied by the caller.
public struct CallNamesReducer: Sendable {
    public typealias State = CallNamesState
    public typealias Event = CallNamesEvent
    public typealias Effect = CallNamesEffect

    private let name: @Sendable (Double, Double, [Participant], [Activity], Double) -> String?
    private let confirm: @Sendable ([Row], [DiarizedTurn], CallEvidence) -> [Int: String]

    /// Production supplies `LiveNames.match` and `AfterCallNames.names`; row-name memory
    /// belongs only to `State.rowNames`.
    public init(
        name: @escaping @Sendable (Double, Double, [Participant], [Activity], Double) -> String?,
        confirm: @escaping @Sendable ([Row], [DiarizedTurn], CallEvidence) -> [Int: String]
    ) {
        self.name = name; self.confirm = confirm
    }

    public func reduce(_ state: State, _ event: Event) -> (State, Effect?) {
        var next = state
        switch event {
        case .start:
            guard state.observation == .idle else { return (state, nil) }
            next.observation = .observing
            return (next, .observe)

        case .stop:
            guard state.observation == .observing else { return (state, nil) }
            next.observation = .stopping
            return (next, .stopObserving)

        case .observationStopped:
            guard state.observation == .stopping else { return (state, nil) }
            next.observation = .stopped
            return (next, nil)

        case let .rows(rows, now):
            let evidence = publish(&next, now: now)
            let roster = evidence.members.map { Participant(id: $0.id, name: $0.name, isLocal: $0.isLocal) }
            let activities = evidence.intervals.map {
                Activity(participantID: $0.memberID, start: $0.start, end: $0.end, uncertainty: AfterCallNames.uncertainty)
            }
            for row in rows.sorted(by: { $0.id < $1.id }) where next.rowNames[row.id] == nil {
                guard let given = name(row.start, row.end, roster, activities, next.through) else { continue }
                next.rowNames[row.id] = given
                if next.participantIDs[given] == nil {
                    next.participantOrder.append(given)
                    next.participantIDs[given] = "z\(next.participantOrder.count)"
                }
            }
            return (next, nil)

        case let .diarized(turns, rows):
            // Without speaker turns or call-app evidence there is nothing to confirm: names stay tentative.
            guard !turns.isEmpty, !state.spoken.isEmpty else { return (state, nil) }
            let evidence = CallEvidence(roster: state.roster, spoken: state.spoken.map {
                .init(name: $0.name, start: $0.start, end: $0.end)
            }, through: state.through)
            return (state.confirming(confirm(rows, turns, evidence)), nil)

        case let .browser(event):
            var browser = state.browser.observation
            browser.receive(event)
            next.browser = .init(browser)
            guard next.browser != state.browser else { return (state, nil) }
            publish(&next)
            return (next, nil)

        case let .browserConnected(id):
            guard next.browserConnections.insert(id).inserted else { return (state, nil) }
            publish(&next)
            return (next, nil)

        case let .browserDisconnected(id):
            guard next.browserConnections.remove(id) != nil else { return (state, nil) }
            publish(&next)
            return (next, nil)

        case .zoom(.lost, _):
            return (state, nil)

        case .zoom, .tick:
            var zoom = state.zoom.observation
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
            case .rows, .diarized, .browser, .browserConnected, .browserDisconnected, .start, .stop, .observationStopped: break
            }
            next.zoom = .init(zoom)
            if next.zoom != state.zoom { publish(&next) }
            return (next, nil)
        }
    }

    @discardableResult
    private func publish(_ state: inout State, now: Double? = nil) -> State.Evidence {
        let usesBrowser = !state.browser.members.isEmpty
        let evidence = usesBrowser ? state.browser : state.zoom
        state.roster = evidence.members.filter { !$0.isLocal }.map(\.name)
        let names = Dictionary(evidence.members.map { ($0.id, $0.name) }, uniquingKeysWith: { first, _ in first })
        state.spoken = evidence.intervals.map {
            .init(name: names[$0.memberID] ?? $0.memberID, start: $0.start, end: $0.end)
        }
        state.through = evidence.through
        // Browser silence is knowledge while a clocked connection is open; it is
        // not an observation timestamp and must not reject later arriving events.
        if usesBrowser, !state.browserConnections.isEmpty, let now {
            state.through = max(state.through, now)
        }
        return evidence
    }
}

private extension CallNamesState.Evidence {
    var observation: CallObservation {
        CallObservation(timeout: timeout, epoch: epoch, sequence: sequence, members: members,
                        intervals: intervals, through: through, health: health)
    }

    init(_ observation: CallObservation) {
        self.init(members: observation.members, intervals: observation.intervals, through: observation.through,
                  epoch: observation.epoch, sequence: observation.sequence, health: observation.health,
                  timeout: observation.timeout)
    }
}
