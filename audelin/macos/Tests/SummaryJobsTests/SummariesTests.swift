import Synchronization
import SummaryJobs
import Testing

@Suite struct SummariesTests {
    @Test func makingTheReducerRendersNothing() {
        let format = FormatSpy()
        _ = SummariesReducer(format: format.call)
        #expect(format.payloads.isEmpty)
    }
    @Test func aNewMachineAcceptsWithDispatchOnAndNoCalls() {
        let state = makeState()
        #expect(state.lifecycle == .accepting && state.dispatch && state.calls.isEmpty)
    }
}

func makeState(calls: [String: SummariesState.Call] = [:]) -> SummariesState { .init(calls: calls) }

/// Records each status the reducer renders and answers with a stub that names its payload.
final class FormatSpy: Sendable {
    struct Payload: Equatable, Sendable { let stage: SummariesState.Call.Stage; let warning: Bool }
    private let recorded = Mutex<[Payload]>([])
    var payloads: [Payload] { recorded.withLock { $0 } }
    var call: @Sendable (SummariesState.Call.Stage, Bool) -> String {
        { [self] stage, warning in
            recorded.withLock { $0.append(.init(stage: stage, warning: warning)) }
            return "\(stage):\(warning)"
        }
    }
}
