import CallsListUI
import Foundation
import Observation
import Recordings
import Testing
@testable import Composer

/// The calls window's detail: it follows the selection whether or not the
/// preview is open, shows where the summary stands when there are no notes,
/// and sends its buttons to the list's own actions.
@MainActor
@Suite(.timeLimit(.minutes(1)))
struct CallsDetailTests {
    @Test func theDetailFollowsTheSelectionWithoutThePreview() async throws {
        let sut = Fixture(notes: [a: "# A notes"])
        #expect(sut.calls.detail == nil)

        await sut.calls.send(.select(a))
        await sut.waitDetail { $0?.content == .notes("# A notes") }
        #expect(sut.calls.detail?.title == "A" && sut.calls.detail?.duration == "1:00")
        #expect(sut.calls.preview == nil)

        await sut.calls.send(.selectNext)
        await sut.waitDetail { $0?.id == b }
        #expect(sut.calls.detail?.content == CallsDetail.Content.none(notesOff: false))
    }

    @Test func withoutNotesTheDetailShowsWhereTheSummaryStands() async throws {
        let sut = Fixture()
        sut.summaries.badges = [a: .pending, b: .failed]
        sut.summaries.statuses = [a: "Готовим", b: "Лимит запросов"]
        sut.summaries.retryable = [b]

        await sut.calls.send(.select(a))
        await sut.waitDetail { $0?.content == .preparing }
        await sut.calls.send(.select(b))
        await sut.waitDetail { $0?.content == .failed(reason: "Лимит запросов", canRetry: true) }

        sut.summaries.retryable = []
        await sut.calls.send(.select(a))
        await sut.calls.send(.select(b))
        await sut.waitDetail { $0?.content == .failed(reason: "Лимит запросов", canRetry: false) }
    }

    @Test(arguments: [true, false])
    func noSummaryNamesSettingsWhenNotesAreOff(enabled: Bool) async throws {
        let sut = Fixture(notesEnabled: enabled)

        await sut.calls.send(.select(a))

        await sut.waitDetail { $0?.content == CallsDetail.Content.none(notesOff: !enabled) }
    }

    @Test func unreadableNotesCarryTheReason() async throws {
        let sut = Fixture(unreadable: [a])

        await sut.calls.send(.select(a))

        await sut.waitDetail { $0?.content == .unreadable("нет доступа") }
    }

    @Test func aSummaryThatArrivesUpdatesTheShownDetail() async throws {
        let sut = Fixture()
        sut.calls.show()
        sut.summaries.badges = [a: .pending]
        sut.summaries.statuses = [a: "Готовим"]
        await sut.calls.send(.select(a))
        await sut.waitDetail { $0?.content == .preparing }

        sut.notes[a] = "# Ready"
        sut.summaries.badges = [:]
        sut.summaries.statuses = [:]

        await sut.waitDetail { $0?.content == .notes("# Ready") }
    }

    @Test func copyPutsTheShownNotesOutAndDoesNothingWithoutThem() async throws {
        let sut = Fixture(notes: [a: "# A notes"])

        await sut.calls.send(detail: .copy)
        await sut.calls.send(.select(b))
        await sut.waitDetail { $0?.id == b }
        await sut.calls.send(detail: .copy)
        await sut.calls.send(.select(a))
        await sut.waitDetail { $0?.content == .notes("# A notes") }
        await sut.calls.send(detail: .copy)

        #expect(sut.copies == ["# A notes"])
    }

    @Test func theDetailsActionsAreTheListsActionsOnTheShownCall() async throws {
        let sut = Fixture()
        sut.summaries.badges = [b: .failed]
        sut.summaries.retryable = [b]
        await sut.calls.send(.select(b))
        await sut.waitDetail { $0?.id == b }

        await sut.calls.send(detail: .open)
        #expect(sut.opened == [sut.folder(b)])

        await sut.calls.send(detail: .retrySummary)
        #expect(sut.retried == [b])

        await sut.calls.send(detail: .rename)
        #expect(sut.calls.state.editing == .init(id: b, title: "B"))
        await sut.calls.send(.cancelRename)

        await sut.calls.send(detail: .delete)
        #expect(sut.sent.last == .askDelete(b))
    }
}

private let a = "2024.01.01-1000", b = "2024.01.01-0900"

private struct Unreadable: LocalizedError { var errorDescription: String? { "нет доступа" } }

@MainActor @Observable private final class FakeSummaries {
    var statuses: [String: String] = [:]
    var badges: [String: CallsListState.Row.Summary] = [:]
    var retryable: Set<String> = []
}

@MainActor private final class Fixture {
    let summaries = FakeSummaries()
    var notes: [String: String]
    var copies: [String] = []
    var opened: [URL] = []
    var retried: [String] = []
    var sent: [RecordingsEvent] = []
    var calls: AudelinCalls!

    init(notes: [String: String] = [:], unreadable: Set<String> = [], notesEnabled: Bool = true) {
        self.notes = notes
        let listing = RecordingsState(calls: [
            .init(id: a, title: "A", start: Date(timeIntervalSince1970: 36_000), duration: 60),
            .init(id: b, title: "B", start: Date(timeIntervalSince1970: 32_400), duration: 120),
        ])
        calls = AudelinCalls(
            inputs: RecordingsInputs(state: { listing }, send: { [unowned self] in sent.append($0) }),
            timeZone: .gmt, now: { Date(timeIntervalSince1970: 40_000) }, recordingState: { .init() },
            location: { [unowned self] in folder($0) }, openFolder: { [unowned self] in opened.append($0); return true },
            present: {}, summaryStatuses: { [summaries] in summaries.statuses }, summaryBadges: { [summaries] in summaries.badges },
            notes: { [unowned self] id in
                if unreadable.contains(id) { throw Unreadable() }
                return self.notes[id]
            },
            copy: { [unowned self] in copies.append($0) }, notesEnabled: { notesEnabled },
            retryableSummaries: { [summaries] in summaries.retryable },
            retrySummary: { [unowned self] in retried.append($0) })
    }

    func folder(_ id: String) -> URL { URL(fileURLWithPath: "/calls/\(id)") }

    func waitDetail(until predicate: (CallsDetail?) -> Bool) async {
        for await detail in Observations({ self.calls.detail }) where predicate(detail) { return }
    }
}
