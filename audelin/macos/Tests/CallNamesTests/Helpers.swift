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
        $0.sequence = 3; $0.zoomSequence = 3; $0.zoomEpoch = 1; $0.zoomHealth = .healthy
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

func makeSUT(stubs: [String?] = []) -> (sut: Reducer, spy: NamingSpy) {
    let spy = NamingSpy(stubs: stubs)
    return (Reducer(name: spy.name), spy)
}

@discardableResult
func assert(
    _ state: State, _ event: Event, using sut: Reducer,
    _ update: (inout State) -> Void = { _ in }, sourceLocation: SourceLocation = #_sourceLocation
) -> State {
    var expected = state
    update(&expected)
    let (next, effect): (State, CallNamesEffect?) = sut.reduce(state, event)
    #expect(next == expected, "\(state) + \(event)", sourceLocation: sourceLocation)
    #expect(effect == nil, sourceLocation: sourceLocation)
    return next
}
