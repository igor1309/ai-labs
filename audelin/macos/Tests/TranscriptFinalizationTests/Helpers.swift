import Testing
import TranscriptFinalization

typealias State = TranscriptFinalizationState<String>
typealias Event = TranscriptFinalizationEvent<String>
typealias Effect = TranscriptFinalizationEffect<String>
typealias Reducer = TranscriptFinalizationReducer<String>

let callID = "call"

func makeState(_ call: State.Call? = nil) -> State { State(calls: call.map { [callID: $0] } ?? [:]) }

func makeCall(_ stage: State.Stage = .writing, saved: Bool = true, entries: [String] = ["hello"], usable: Bool = true) -> State.Call {
    .init(stage: stage, latestWriteSucceeded: saved, entries: entries, usable: usable)
}

func assert(
    _ state: State, _ event: Event, _ update: (inout State) -> Void = { _ in },
    sourceLocation: SourceLocation = #_sourceLocation
) {
    var expected = state
    update(&expected)
    #expect(Reducer.reduce(state, event).0 == expected, "\(state) + \(event)", sourceLocation: sourceLocation)
}

func assert(_ state: State, _ event: Event, delivers expected: Effect?, sourceLocation: SourceLocation = #_sourceLocation) {
    #expect(Reducer.reduce(state, event).1 == expected, "\(state) + \(event)", sourceLocation: sourceLocation)
}
