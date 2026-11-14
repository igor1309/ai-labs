import Foundation
import Recordings
import Synchronization
import Testing

struct RecordingsMergeTests {
    @Test func S1_mergeModeOpensWithNothingSelected() {
        assert(listed(), .enterMergeMode, delivers: nil) { $0.phase = .merging }
        assert(listed { $0.failure = .init(id: "A", reason: "disk") }, .enterMergeMode, delivers: nil) {
            $0.phase = .merging
            $0.failure = nil
        }
    }

    @Test func mergeModeWaitsForOtherActions() {
        assert(listed { $0.phase = .renaming("A") }, .enterMergeMode, delivers: nil)
        assert(listed { $0.isListing = true }, .enterMergeMode, delivers: nil)
        assert(listed { $0.stopping = true }, .enterMergeMode, delivers: nil)
    }

    @Test func S3_selectingAndUnselectingCalls() {
        let merging = listed { $0.phase = .merging }
        assert(merging, .toggleMergeSelection("A"), delivers: nil) { $0.mergeSelection = ["A"] }
        assert(listed { $0.phase = .merging; $0.mergeSelection = ["A", "B"] }, .toggleMergeSelection("A"), delivers: nil) {
            $0.mergeSelection = ["B"]
        }
        assert(merging, .toggleMergeSelection("Z"), delivers: nil)
        assert(listed(), .toggleMergeSelection("A"), delivers: nil)
    }

    @Test func S12_leavingMergeModeClearsTheSelection() {
        assert(listed { $0.phase = .merging; $0.mergeSelection = ["A", "B"] }, .leaveMergeMode, delivers: nil) {
            $0.phase = .idle
            $0.mergeSelection = []
        }
        assert(listed(), .leaveMergeMode, delivers: nil)
    }

    @Test func noOtherActionStartsInMergeMode() {
        let merging = listed { $0.phase = .merging; $0.mergeSelection = ["A"] }
        assert(merging, .rename(id: "A", title: "New"), delivers: nil)
        assert(merging, .askDelete("A"), delivers: nil)
        assert(merging, .refresh, delivers: nil)
        assert(merging, .chooseFolder(URL(fileURLWithPath: "/elsewhere")), delivers: nil)
    }

    @Test func theIdleQueryIsNotAskedOnInit() {
        let idle = IdleSpy(answer: true)
        _ = idle.reducer
        #expect(idle.asked == 0)
    }

    @Test func S1_enteringMergeModeAsksTheIdleQueryOnce() {
        let idle = IdleSpy(answer: true)
        assert(listed(), .enterMergeMode, delivers: nil, using: idle.reducer) { $0.phase = .merging }
        #expect(idle.asked == 1)
        #expect(idle.busyAsked == 0)
    }

    @Test func S2_mergeModeIsRefusedWhileBusy() {
        let idle = IdleSpy(answer: false)
        assert(listed { $0.failure = .init(id: "A", reason: "disk") }, .enterMergeMode, delivers: nil, using: idle.reducer) {
            $0.failure = .init(id: nil, reason: "Audelin is busy")
        }
        #expect(idle.asked == 1)
        #expect(idle.busyAsked == 1)
    }

    @Test func theIdleQueryIsNotAskedOutsideMergeEntry() {
        let idle = IdleSpy(answer: true)
        let merging = listed { $0.phase = .merging }
        assert(merging, .toggleMergeSelection("A"), delivers: nil, using: idle.reducer) { $0.mergeSelection = ["A"] }
        assert(merging, .leaveMergeMode, delivers: nil, using: idle.reducer) { $0.phase = .idle }
        assert(listed { $0.phase = .renaming("A") }, .enterMergeMode, delivers: nil, using: idle.reducer)
        assert(listed(), .refresh, delivers: .list, using: idle.reducer) { $0.isListing = true }
        #expect(idle.asked == 0)
    }
}

private let calls = ["C", "B", "A"].map { RecordedCall(id: $0, title: "", start: .distantPast, duration: 60) }

private func listed(_ change: (inout RecordingsState) -> Void = { _ in }) -> RecordingsState {
    var state = RecordingsState(calls: calls, callsFolder: URL(fileURLWithPath: "/calls")); change(&state); return state
}

private final class IdleSpy: Sendable {
    private let answer: Bool
    private let counts = Mutex((idle: 0, busy: 0))
    init(answer: Bool) { self.answer = answer }
    var asked: Int { counts.withLock { $0.idle } }
    var busyAsked: Int { counts.withLock { $0.busy } }
    var reducer: RecordingsReducer {
        RecordingsReducer(failureMessage: { $0 + $1 }, moveText: stubMoveText,
                          isIdle: { self.counts.withLock { $0.idle += 1 }; return self.answer },
                          busyMessage: { self.counts.withLock { $0.busy += 1 }; return "Audelin is busy" })
    }
}

private func assert(_ state: RecordingsState, _ event: RecordingsEvent, delivers effect: RecordingsEffect?,
                    using reducer: RecordingsReducer = defaultReducer,
                    sourceLocation: SourceLocation = #_sourceLocation, _ change: (inout RecordingsState) -> Void = { _ in }) {
    var expected = state; change(&expected)
    let result = reducer.reduce(state, event)
    #expect(result.0 == expected, sourceLocation: sourceLocation)
    #expect(result.1 == effect, sourceLocation: sourceLocation)
}
