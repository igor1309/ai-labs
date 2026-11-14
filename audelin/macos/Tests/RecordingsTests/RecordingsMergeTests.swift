import Foundation
import Recordings
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
}

private let calls = ["C", "B", "A"].map { RecordedCall(id: $0, title: "", start: .distantPast, duration: 60) }

private func listed(_ change: (inout RecordingsState) -> Void = { _ in }) -> RecordingsState {
    var state = RecordingsState(calls: calls, callsFolder: URL(fileURLWithPath: "/calls")); change(&state); return state
}

private func assert(_ state: RecordingsState, _ event: RecordingsEvent, delivers effect: RecordingsEffect?,
                    sourceLocation: SourceLocation = #_sourceLocation, _ change: (inout RecordingsState) -> Void = { _ in }) {
    var expected = state; change(&expected)
    let result = defaultReducer.reduce(state, event)
    #expect(result.0 == expected, sourceLocation: sourceLocation)
    #expect(result.1 == effect, sourceLocation: sourceLocation)
}
