import RecordingConditions
import Testing

typealias State = RecordingConditionsState
typealias Event = RecordingConditionsEvent
typealias Effect = RecordingConditionsEffect

let roomy = DiskReadings(folderExists: true, writable: true, availableCapacity: 40_000_000_000)
let full = DiskReadings(folderExists: true, writable: true, availableCapacity: 1)
let missing = DiskReadings(folderExists: false, writable: false, availableCapacity: nil)

func makeReadings(_ disk: DiskReadings = roomy, microphone: Bool = true, at takenAt: Double = 1) -> ConditionReadings {
    ConditionReadings(microphoneAccess: microphone, disk: disk, takenAt: takenAt)
}

func makeState(
    readings: ConditionReadings? = nil, access: Bool? = nil, moving: Bool = false, moves: UInt64 = 0,
    awaitedReading: UInt64? = nil, published: [RecordingCondition: Availability] = [:]
) -> State {
    State(readings: readings, callAudioAccess: access, storageMoving: moving, moves: moves,
          awaitedReading: awaitedReading, published: published)
}

/// Every condition read at time 1 and published as available.
func makeAvailableState() -> State {
    makeState(readings: makeReadings(), access: true, published: [
        .microphoneAccess: .available, .callAudioAccess: .available, .callsFolder: .available, .room: .available,
    ])
}

/// A move holds the calls folder: the first move since launch.
func makeMovingState() -> State {
    var state = makeAvailableState()
    state.storageMoving = true; state.moves = 1; state.published[.callsFolder] = .moving
    return state
}

/// The first move let the calls folder go and its reading is awaited.
func makeAwaitingState() -> State {
    var state = makeMovingState()
    state.storageMoving = false; state.awaitedReading = 1
    return state
}

func assert(
    _ state: State, _ event: Event, _ update: (inout State) -> Void = { _ in },
    sourceLocation: SourceLocation = #_sourceLocation
) {
    var expected = state
    update(&expected)
    #expect(RecordingConditionsReducer().reduce(state, event).0 == expected, "\(state) + \(event)", sourceLocation: sourceLocation)
}

func assert(_ state: State, _ event: Event, delivers expected: Effect?, sourceLocation: SourceLocation = #_sourceLocation) {
    #expect(RecordingConditionsReducer().reduce(state, event).1 == expected, "\(state) + \(event)", sourceLocation: sourceLocation)
}
