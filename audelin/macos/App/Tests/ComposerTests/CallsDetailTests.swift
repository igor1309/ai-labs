import CallsListUI
import Foundation
import Observation
import Recordings
import Testing
@testable import Composer

/// The calls window's detail: it follows the selection, shows where the summary stands when there are no notes,
/// and sends its buttons to the list's own actions.
@MainActor
@Suite(.timeLimit(.minutes(1)))
struct CallsDetailTests {
    @Test func theDetailFollowsTheSelection() async throws {
        let sut = Fixture(notes: [a: "# A notes"])
        #expect(sut.calls.detail == nil)

        await sut.calls.send(.select(a))
        await sut.waitDetail { $0?.content == .notes("# A notes") }
        #expect(sut.calls.detail?.title == "A" && sut.calls.detail?.duration == "1:00")

        await sut.calls.send(.selectNext)
        await sut.waitDetail { $0?.id == b }
        #expect(sut.calls.detail?.content == CallsDetail.Content.none)
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

    @Test
    func noSummaryOffersMakingNotes() async throws {
        let sut = Fixture()

        await sut.calls.send(.select(a))

        await sut.waitDetail { $0?.content == CallsDetail.Content.none }
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

    @Test func aSearchThatHidesTheSelectedCallEmptiesTheDetailAndClearingItBringsItBack() async throws {
        let sut = Fixture(notes: [a: "# A notes"])
        await sut.calls.send(.select(a))
        await sut.waitDetail { $0?.id == a }

        await sut.calls.send(.search("B"))
        await sut.waitDetail { $0 == nil }
        #expect(sut.calls.state.selectedID == nil)
        await sut.calls.send(detail: .delete)
        #expect(!sut.sent.contains(.askDelete(a)))

        await sut.calls.send(.search(""))
        await sut.waitDetail { $0?.content == .notes("# A notes") }
        #expect(sut.calls.state.selectedID == a)
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

    @Test func inANarrowWindowReadingACallSelectsItAndOpensItsWindow() async {
        let sut = Fixture(notes: [b: "# B notes"])
        #expect(!sut.calls.state.narrow)

        sut.calls.widthChanged(narrow: true)
        #expect(sut.calls.state.narrow)
        await sut.calls.send(.read(b))
        await sut.waitDetail { $0?.content == .notes("# B notes") }

        #expect(sut.calls.state.selectedID == b && sut.readCalls == 1)
        await sut.calls.send(.read("missing"))
        #expect(sut.readCalls == 1)
        sut.calls.widthChanged(narrow: false)
        #expect(!sut.calls.state.narrow)
    }

    @Test func theCallsWindowOpensOnlyOnceItsDetailIsThatCall() async {
        let sut = Fixture(notes: [a: "# A notes", b: "# B notes"])
        await sut.calls.send(.select(a))
        await sut.waitDetail { $0?.id == a }
        sut.calls.widthChanged(narrow: true)
        sut.held = b

        let reading = Task { await sut.calls.send(.read(b)) }
        await sut.waitHeld()
        #expect(sut.readCalls == 0)
        sut.letGo()
        await reading.value

        #expect(sut.readDetails == [b])
    }

    @Test func closingTheWindowStopsTheNotesScanBeforeTheNextCall() async {
        let sut = Fixture(notes: [a: "# A", b: "# B"])
        sut.duringRead = { [unowned sut] id in if id == a && sut.reads.count == 1 { sut.calls.windowClosed() } }

        sut.calls.show()
        await sut.waitReads(1)
        sut.calls.show()
        await sut.waitReads(3)

        #expect(sut.reads == [a, a, b])
    }

    @Test func makingAndCancellingActOnTheShownCall() async {
        let sut = Fixture()
        await sut.calls.send(.read(b))
        #expect(sut.calls.state.rows.first { $0.id == b }?.canMakeSummary == true)
        await sut.calls.send(detail: .makeSummary)
        #expect(sut.made == [b])
        sut.summaries.badges[b] = .pending
        #expect(sut.calls.state.rows.first { $0.id == b }?.canMakeSummary == false)
        await sut.calls.send(detail: .cancelSummary)
        #expect(sut.cancelled == [b])
        sut.summaries.badges[b] = .failed
        #expect(sut.calls.state.rows.first { $0.id == b }?.canMakeSummary == false)
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
    var made: [String] = []
    var cancelled: [String] = []
    var sent: [RecordingsEvent] = []
    var reads: [String] = []
    var readCalls = 0
    /// The detail's call each time the call's window was asked for.
    var readDetails: [String?] = []
    /// Holds a call's notes read until the test lets it go.
    var held: String?
    private var release: CheckedContinuation<Void, Never>?
    var duringRead: (String) -> Void = { _ in }
    private var readWaiters: [(count: Int, resume: () -> Void)] = []
    var calls: AudelinCalls!

    init(notes: [String: String] = [:], unreadable: Set<String> = []) {
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
                if id == held { await withCheckedContinuation { release = $0 } }
                reads.append(id)
                duringRead(id)
                let ready = readWaiters.filter { $0.count <= reads.count }
                readWaiters.removeAll { $0.count <= reads.count }
                ready.forEach { $0.resume() }
                if unreadable.contains(id) { throw Unreadable() }
                return self.notes[id].map { (text: $0, made: nil) }
            },
            makeSummary: { [unowned self] in made.append($0) }, cancelSummary: { [unowned self] in cancelled.append($0) },
            copy: { [unowned self] in copies.append($0) }, readCall: { [unowned self] in readCalls += 1; readDetails.append(calls.detail?.id) },
            retryableSummaries: { [summaries] in summaries.retryable },
            retrySummary: { [unowned self] in retried.append($0) })
    }

    func waitHeld() async { while release == nil { await Task.yield() } }
    func letGo() { release?.resume(); release = nil; held = nil }

    func waitReads(_ count: Int) async {
        if reads.count >= count { return }
        await withCheckedContinuation { continuation in readWaiters.append((count, { continuation.resume() })) }
    }

    func folder(_ id: String) -> URL { URL(fileURLWithPath: "/calls/\(id)") }

    func waitDetail(until predicate: (CallsDetail?) -> Bool) async {
        for await detail in Observations({ self.calls.detail }) where predicate(detail) { return }
    }
}
