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
        assert(listed { $0.stopping = true }, .enterMergeMode, delivers: nil) { $0.stopped = true }
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

    @Test func S4_fewerThanTwoCallsDoNotMerge() {
        let idle = IdleSpy(answer: true)
        assert(listed { $0.phase = .merging; $0.mergeSelection = ["A"] }, .confirmMerge, delivers: nil, using: idle.reducer)
        assert(listed { $0.phase = .merging }, .confirmMerge, delivers: nil, using: idle.reducer)
        #expect(idle.asked == 0)
    }

    @Test func S6_farApartCallsAskAgain() {
        assert(listed { $0.phase = .merging; $0.mergeSelection = ["A", "C"] }, .confirmMerge, delivers: nil) {
            $0.phase = .warnedFarApart
        }
    }

    @Test func S8_goingBackAfterTheWarningKeepsTheSelection() {
        assert(listed { $0.phase = .warnedFarApart; $0.mergeSelection = ["A", "C"] }, .goBackFromWarning, delivers: nil) {
            $0.phase = .merging
        }
        assert(listed { $0.phase = .merging; $0.mergeSelection = ["A", "C"] }, .goBackFromWarning, delivers: nil)
    }

    @Test func theWarningTakesNoSelectionChange() {
        assert(listed { $0.phase = .warnedFarApart; $0.mergeSelection = ["A", "C"] }, .toggleMergeSelection("B"), delivers: nil)
    }

    @Test func S5_neighbouringCallsMerge() {
        let idle = IdleSpy(answer: true)
        assert(listed { $0.phase = .merging; $0.mergeSelection = ["A", "B"]; $0.failure = .init(id: nil, reason: "busy") },
               .confirmMerge, delivers: .merge(["B", "A"]), using: idle.reducer) {
            $0.phase = .runningMerge
            $0.failure = nil
        }
        #expect(idle.asked == 1)
    }

    @Test func S7_mergingAnywayAfterTheWarning() {
        let idle = IdleSpy(answer: true)
        assert(listed { $0.phase = .warnedFarApart; $0.mergeSelection = ["A", "C"] }, .mergeAnyway, delivers: .merge(["C", "A"]), using: idle.reducer) {
            $0.phase = .runningMerge
        }
        #expect(idle.asked == 1)
        assert(listed { $0.phase = .merging; $0.mergeSelection = ["A", "C"] }, .mergeAnyway, delivers: nil, using: idle.reducer)
        #expect(idle.asked == 1)
    }

    @Test func S6_theWarningDoesNotAskTheIdleQuery() {
        let idle = IdleSpy(answer: true)
        assert(listed { $0.phase = .merging; $0.mergeSelection = ["A", "C"] }, .confirmMerge, delivers: nil, using: idle.reducer) {
            $0.phase = .warnedFarApart
        }
        #expect(idle.asked == 0)
    }

    @Test func S9_confirmingWhileBusyIsRefused() {
        let idle = IdleSpy(answer: false)
        assert(listed { $0.phase = .merging; $0.mergeSelection = ["A", "B"] }, .confirmMerge, delivers: nil, using: idle.reducer) {
            $0.failure = .init(id: nil, reason: "Audelin is busy")
        }
        #expect(idle.asked == 1)
        #expect(idle.busyAsked == 1)
    }

    @Test func S13_mergingAnywayWhileBusyIsRefused() {
        let idle = IdleSpy(answer: false)
        assert(listed { $0.phase = .warnedFarApart; $0.mergeSelection = ["A", "C"] }, .mergeAnyway, delivers: nil, using: idle.reducer) {
            $0.phase = .merging
            $0.failure = .init(id: nil, reason: "Audelin is busy")
        }
        #expect(idle.asked == 1)
    }

    @Test func aMergeDoesNotStartWhileStopping() {
        assert(listed { $0.phase = .merging; $0.mergeSelection = ["A", "B"]; $0.stopping = true }, .confirmMerge, delivers: nil) {
            $0.failure = .init(id: nil, reason: "busy")
            $0.stopped = true
        }
    }

    @Test func storageSettlesForQuitOnlyOnceARunningMergeEnds() {
        let running = listed { $0.phase = .runningMerge; $0.mergeSelection = ["A", "B"] }
        assert(running, .stopActions, delivers: nil) { $0.stopping = true }
        assert(listed { $0.phase = .runningMerge; $0.mergeSelection = ["A", "B"]; $0.stopping = true },
               .mergeFailed("disk"), delivers: nil) {
            $0.phase = .merging
            $0.failure = .init(id: nil, reason: "disk")
            $0.stopped = true
        }
    }

    @Test func S10_aMergedCallIsSelected() {
        assert(listed { $0.phase = .runningMerge; $0.mergeSelection = ["A", "B"] }, .merged("A"), delivers: .list) {
            $0.phase = .idle
            $0.mergeSelection = []
            $0.mergedCallID = "A"
            $0.isListing = true
        }
        assert(listed { $0.phase = .merging }, .merged("A"), delivers: nil)
    }

    @Test func S11_aFailedMergeIsNamed() {
        assert(listed { $0.phase = .runningMerge; $0.mergeSelection = ["A", "B"] }, .mergeFailed("disk full"), delivers: nil) {
            $0.phase = .merging
            $0.failure = .init(id: nil, reason: "disk full")
        }
        assert(listed { $0.phase = .merging }, .mergeFailed("disk full"), delivers: nil)
    }

    @Test func enteringMergeModeForgetsTheLastMergedCall() {
        assert(listed { $0.mergedCallID = "A" }, .enterMergeMode, delivers: nil) {
            $0.phase = .merging
            $0.mergedCallID = nil
        }
    }

    @Test func nothingElseStartsWhileAMergeRuns() {
        let running = listed { $0.phase = .runningMerge; $0.mergeSelection = ["A", "B"] }
        for event: RecordingsEvent in [.enterMergeMode, .leaveMergeMode, .toggleMergeSelection("C"), .confirmMerge, .refresh, .askDelete("C")] {
            assert(running, event, delivers: nil)
        }
    }

    @Test(arguments: [
        (["A", "B"], false), (["A", "C"], true), (["C", "B", "A"], false), (["A"], false), ([], false), (["A", "Z"], false),
    ] as [([String], Bool)])
    func callsAreFarApartWhenAnUnselectedCallLiesBetween(_ selected: [String], _ far: Bool) {
        #expect(RecordingsReducer.farApart(calls, selected: Set(selected)) == far)
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
