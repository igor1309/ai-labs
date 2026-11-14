import Synchronization
import Testing
import TranscriptFinalization

typealias State = TranscriptFinalizationState<String, String, String>
typealias Event = TranscriptFinalizationEvent<String, String, String>
typealias Effect = TranscriptFinalizationEffect<String, String, String, String>
typealias Reducer = TranscriptFinalizationReducer<String, String, String, String>

let callID = "call"

func makeState(_ call: State.Call? = nil, shuttingDown: Bool = false) -> State {
    State(calls: call.map { [callID: $0] } ?? [:], shuttingDown: shuttingDown)
}

func makeCall(
    _ stage: State.Stage = .writing, saved: Bool = true, raw: String? = "raw", far: String? = nil, heard: String? = nil
) -> State.Call {
    .init(stage: stage, latestWriteSucceeded: saved, raw: raw, far: far, heard: heard)
}

/// Records each entries request and answers with `stub`.
final class EntriesSpy: Sendable {

    struct Request: Equatable { let raw: String; let far: String?; let heard: String? }

    let stub: [String]
    private let recorded = Mutex<[Request]>([])

    init(stub: [String] = ["entry"]) { self.stub = stub }

    var requests: [Request] { recorded.withLock { $0 } }

    func entries(_ raw: String, _ far: String?, _ heard: String?) -> [String] {
        recorded.withLock { $0.append(.init(raw: raw, far: far, heard: heard)) }
        return stub
    }
}

func makeSUT(stub: [String] = ["entry"]) -> (sut: Reducer, spy: EntriesSpy) {
    let spy = EntriesSpy(stub: stub)
    return (Reducer(entries: spy.entries), spy)
}

func assert(
    _ state: State, _ event: Event, _ update: (inout State) -> Void = { _ in },
    sourceLocation: SourceLocation = #_sourceLocation
) {
    var expected = state
    update(&expected)
    #expect(makeSUT().sut.reduce(state, event).0 == expected, "\(state) + \(event)", sourceLocation: sourceLocation)
}

func assert(_ state: State, _ event: Event, delivers expected: Effect?, sourceLocation: SourceLocation = #_sourceLocation) {
    #expect(makeSUT().sut.reduce(state, event).1 == expected, "\(state) + \(event)", sourceLocation: sourceLocation)
}

func published(_ entries: [String] = ["entry"], finalWrite: Bool = true) -> Effect {
    .publish([callID: .init(entries: entries, usable: !entries.isEmpty, finalWrite: finalWrite)])
}
