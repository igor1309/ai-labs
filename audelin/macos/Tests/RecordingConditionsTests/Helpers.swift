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
    readings: ConditionReadings? = nil, access: Bool? = nil, moving: Bool = false, published: [RecordingCondition: Bool] = [:]
) -> State {
    State(readings: readings, callAudioAccess: access, storageMoving: moving, published: published)
}

/// Every condition read at time 1 and published as available.
func makeAvailableState(moving: Bool = false) -> State {
    makeState(readings: makeReadings(), access: true, moving: moving, published: [
        .microphoneAccess: true, .callAudioAccess: true, .callsFolder: !moving, .room: true,
    ])
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
