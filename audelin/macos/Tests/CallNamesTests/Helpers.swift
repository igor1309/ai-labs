import CallNames
import SpeakerNaming
import Synchronization
import Testing

typealias State = CallNamesState
typealias Event = CallNamesEvent
typealias Reducer = CallNamesReducer

func makeState(_ update: (inout State) -> Void = { _ in }) -> State {
    var state = State()
    update(&state)
    return state
}

func makeObservedState(_ update: (inout State) -> Void = { _ in }) -> State {
    makeState {
        $0.roster = ["Anna"]
        $0.knownNames = ["Anna"]
        $0.spoken = [.init(name: "Anna", start: 1, end: nil)]
        $0.through = 5
        $0.sequence = 3; $0.zoom.sequence = 3; $0.zoom.epoch = 1; $0.zoom.health = .healthy
        $0.zoom.members = [.init(id: "Anna", name: "Anna")]
        $0.zoom.intervals = [.init(memberID: "Anna", start: 1, end: nil)]
        $0.zoom.through = 5
        update(&$0)
    }
}

func makeRow(_ id: Int = 1, start: Double = 1, end: Double = 5) -> Row {
    Row(id: id, start: start, end: end)
}

final class NamingSpy: Sendable {
    struct Request: Equatable, Sendable {
        let start: Double
        let end: Double
        let roster: [Participant]
        let activities: [Activity]
        let through: Double
    }

    let stubs: [String?]
    private let recorded = Mutex<[Request]>([])

    init(stubs: [String?]) { self.stubs = stubs }

    var requests: [Request] { recorded.withLock { $0 } }

    func name(_ start: Double, _ end: Double, _ roster: [Participant], _ activities: [Activity], _ through: Double) -> String? {
        recorded.withLock {
            let index = $0.count
            $0.append(.init(start: start, end: end, roster: roster, activities: activities, through: through))
            return index < stubs.count ? stubs[index] : nil
        }
    }
}

final class ConfirmSpy: Sendable {
    struct Request: Equatable, Sendable {
        let rows: [Row]
        let turns: [DiarizedTurn]
        let evidence: CallEvidence
    }

    let stub: [Int: String]
    private let recorded = Mutex<[Request]>([])

    init(stub: [Int: String]) { self.stub = stub }

    var requests: [Request] { recorded.withLock { $0 } }

    func confirm(_ rows: [Row], _ turns: [DiarizedTurn], _ evidence: CallEvidence) -> [Int: String] {
        recorded.withLock { $0.append(.init(rows: rows, turns: turns, evidence: evidence)) }
        return stub
    }
}

func makeSUT(stubs: [String?] = []) -> (sut: Reducer, spy: NamingSpy) {
    let (sut, spy, _) = makeConfirmingSUT(stubs: stubs)
    return (sut, spy)
}

func makeConfirmingSUT(stubs: [String?] = [], confirmed: [Int: String] = [:]) -> (sut: Reducer, spy: NamingSpy, confirm: ConfirmSpy) {
    let spy = NamingSpy(stubs: stubs)
    let confirm = ConfirmSpy(stub: confirmed)
    return (Reducer(name: spy.name, confirm: confirm.confirm), spy, confirm)
}

@discardableResult
func assert(
    _ state: State, _ event: Event, using sut: Reducer, delivering effect: CallNamesEffect? = nil,
    _ update: (inout State) -> Void = { _ in }, sourceLocation: SourceLocation = #_sourceLocation
) -> State {
    var expected = state
    update(&expected)
    let (next, delivered): (State, CallNamesEffect?) = sut.reduce(state, event)
    #expect(next == expected, "\(state) + \(event)", sourceLocation: sourceLocation)
    #expect(delivered == effect, "\(state) + \(event)", sourceLocation: sourceLocation)
    return next
}

func makeBrowserState(_ update: (inout State) -> Void = { _ in }) -> State {
    makeObservedState {
        $0.browser = .init(
            members: [.init(id: "remote", name: "Boris"), .init(id: "self", name: "Me", isLocal: true)],
            intervals: [.init(memberID: "remote", start: 2, end: nil), .init(memberID: "self", start: 0, end: 1)],
            through: 6, epoch: 4, sequence: 3, health: .healthy
        )
        $0.roster = ["Boris"]
        $0.spoken = [.init(name: "Boris", start: 2, end: nil), .init(name: "Me", start: 0, end: 1)]
        $0.through = 6
        update(&$0)
    }
}

func makeBrowserRequest(through: Double = 6) -> NamingSpy.Request {
    .init(start: 1, end: 5,
          roster: [.init(id: "remote", name: "Boris"), .init(id: "self", name: "Me", isLocal: true)],
          activities: [.init(participantID: "remote", start: 2, end: nil, uncertainty: 0.5),
                       .init(participantID: "self", start: 0, end: 1, uncertainty: 0.5)], through: through)
}

