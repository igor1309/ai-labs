import CallDetail
import Foundation
import Observation
import Recordings
import Testing
@testable import Composer

@MainActor @Observable private final class Listing {
    var state = RecordingsState(calls: [
        .init(id: "1970.01.01-1000", title: "A", start: Date(timeIntervalSince1970: 36_000), duration: 600),
        .init(id: "1970.01.01-0900", title: "B", start: Date(timeIntervalSince1970: 32_400), duration: 120),
    ], phase: .runningMerge)
}

/// The toolbar's merge control, and the call a merge made selected for the detail to read.
@MainActor
@Suite(.timeLimit(.minutes(1)))
struct MergeSelectionWiringTests {
    @Test func theToolbarControlEntersAndLeavesMergeModeAndActsOnlyWhenItCan() {
        let listing = Listing()
        var sent: [RecordingsEvent] = []
        let sut = AudelinCalls(inputs: RecordingsInputs(state: { listing.state }, send: { sent.append($0) }),
                               timeZone: .gmt, now: Date.init, recordingState: { .init() },
                               location: { URL(fileURLWithPath: "/calls/\($0)") }, openFolder: { _ in true }, present: {})
        let control = { (sut.mergeControl.enabled, sut.mergeControl.merging) }
        listing.state.phase = .idle
        #expect(control() == (true, false))
        sut.toggleMergeMode()
        listing.state.phase = .merging
        #expect(control() == (true, true))
        sut.toggleMergeMode()
        #expect(sent.suffix(2) == [.enterMergeMode, .leaveMergeMode])
        for phase: RecordingsState.Phase in [.warnedFarApart, .runningMerge] {
            listing.state.phase = phase
            #expect(control() == (false, true))
        }
        listing.state.phase = .renaming("1970.01.01-1000")
        #expect(control() == (false, false))
    }

    @Test func aMergedCallIsSelectedAndItsNotesAreRead() async throws {
        let listing = Listing()
        let sut = AudelinCalls(inputs: RecordingsInputs(state: { listing.state }, send: { _ in }),
                               timeZone: .gmt, now: { Date(timeIntervalSince1970: 40_000) }, recordingState: { .init() },
                               location: { URL(fileURLWithPath: "/calls/\($0)") }, openFolder: { _ in true }, present: {},
                               notes: { $0 == "1970.01.01-1000" ? (text: "# merged notes", made: nil) : nil })
        sut.show()
        await sut.send(.select("1970.01.01-0900"))
        for await detail in Observations({ sut.detail }) where detail?.id == "1970.01.01-0900" { break }

        listing.state.phase = .idle
        listing.state.mergedCallID = "1970.01.01-1000"

        for await detail in Observations({ sut.detail }) where detail?.content == .notes("# merged notes") { break }
        #expect(sut.state.selectedID == "1970.01.01-1000")
        #expect(sut.detail?.duration == "10:00")
    }
}
