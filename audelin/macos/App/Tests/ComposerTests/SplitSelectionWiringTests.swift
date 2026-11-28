import Foundation
import Recordings
import SettingsUI
import SummaryJobs
import Testing
@testable import Composer

@MainActor
@Suite(.timeLimit(.minutes(1)))
struct SplitSelectionWiringTests {
    @Test func notesSeeACommittedSplitEvenWhenItsListingFails() async throws {
        let original = RecordedCall(id: "A", title: "Two meetings", start: .distantPast, duration: 20)
        var running = RecordingsState(calls: [original], phase: .runningSplit)
        running.split.draft = .init(call: original, cut: 8, firstTitle: "First", secondTitle: "Second")
        let reducer = recordingsReducer { SettingsText(language: .english) }
        let finished = reducer.reduce(running, .splitFinished(.success(.init(first: "A", second: "B")))).0
        let failed = reducer.reduce(finished, .listFailed(request: finished.listRequest, "Disk offline")).0

        let stream = AsyncStream<RecordingsState>.makeStream()
        var events: [SummariesEvent] = []
        let subscription = subscribeCallReplacements(stream.stream) { events.append($0) }
        for state in [running, finished, failed] { stream.continuation.yield(state) }
        stream.continuation.finish()
        await subscription.value

        #expect(events == [.replaced(removed: ["A"], published: ["A", "B"])])
        #expect(failed.calls == [original] && failed.split.refreshFailed)
        #expect(failed.split.listedReplacement == nil)
    }

    @Test func aFinishedSplitSelectsAndRereadsPartOneEvenWhenTheQueryHidTheNewTitle() async throws {
        let start = Date(timeIntervalSince1970: 36_000)
        let original = RecordedCall(id: "1970.01.01-1000", title: "Two meetings", start: start, duration: 360)
        let first = RecordedCall(id: original.id, title: "Planning", start: start, duration: 150)
        let second = RecordedCall(id: "1970.01.01-1002", title: "Release", start: start.addingTimeInterval(120), duration: 210)
        let listing = SplitListing(.init(calls: [original]))
        let sut = AudelinCalls(inputs: .init(state: { listing.state }, send: { listing.sent.append($0) },
                                           states: { listing.feed.subscribe(from: listing.state) }),
                               timeZone: .gmt, now: { start }, recordingState: { .init() },
                               location: { URL(fileURLWithPath: "/calls/\($0)") }, openFolder: { _ in true }, present: {},
                               notes: { _ in .init(current: .init(text: "# \(listing.state.calls.last?.title ?? "")", made: nil)) })
        await sut.send(.search("Two"))
        await sut.send(.select(original.id))
        for await detail in Observations({ sut.detail }) where detail?.content == .notes("# Two meetings") { break }
        #expect(listing.sent.contains(.splitSelectionChanged(original.id)))

        listing.state.calls = [second, first]
        listing.state.replacement = .init(removed: [original.id], published: [first.id, second.id])
        listing.state.split.listedReplacement = .init(first: first.id, second: second.id)
        listing.feed.publish(listing.state)

        for await detail in Observations({ sut.detail }) where detail?.content == .notes("# Planning") { break }
        #expect(sut.state.selectedID == first.id)
        #expect(sut.state.rows.map(\.title) == ["Release", "Planning"])
        #expect(sut.detail?.duration == "2:30")
    }
}

@MainActor private final class SplitListing {
    var state: RecordingsState
    var sent: [RecordingsEvent] = []
    let feed = StateFeed<RecordingsState>()

    init(_ state: RecordingsState) { self.state = state }
}
