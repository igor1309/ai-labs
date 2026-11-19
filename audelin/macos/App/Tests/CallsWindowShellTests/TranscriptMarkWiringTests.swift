import CallDetail
import SummaryPreviewUI
import Testing
@testable import CallsWindowShell

/// CallDetail's mark for the shown version reaches the summary view's state.
struct TranscriptMarkWiringTests {
    private let text = SummaryPreviewText(language: .russian)
    private let reducer = CallDetailReducer(progress: { "making \($0)" }, failure: { _ in "failed" },
                                            transcriptMark: { $0 == .previous ? "mark previous" : "mark current" })
    private let call = CallDetailState.Call(id: "call", title: "Zoom", date: "17.10", duration: "28:00", editable: true,
                                            summary: .init(badge: .none, status: "", canRetry: false))

    @Test func aMarkedOrUnmarkedDetailGivesTheViewItsMark() throws {
        let detail = CallsDetail(id: "call", title: "Zoom", date: "17.10", duration: "28:00", content: .notes("# A", made: nil),
                                 transcriptMark: "Итоги по прежнему транскрипту")
        var unmarked = detail
        unmarked.transcriptMark = nil

        #expect(try #require(detailState(detail, text: text)).transcriptMark == "Итоги по прежнему транскрипту")
        #expect(try #require(detailState(unmarked, text: text)).transcriptMark == nil)
    }

    @Test func switchingVersionsGivesTheViewEachVersionsOwnMark() throws {
        let pair = CallNotesPair(previous: .init(text: "old", made: nil, transcriptIdentity: "earlier"),
                                 current: .init(text: "new", made: nil, transcriptIdentity: "now"),
                                 currentTranscriptIdentity: "now", hasPreviousTranscript: true)
        let read = read(pair)

        let current = try #require(detailState(read.detail, text: text))
        let previous = try #require(detailState(reducer.reduce(read, .versionChosen(.previous)).0.detail, text: text))
        let back = try #require(detailState(reducer.reduce(reducer.reduce(read, .versionChosen(.previous)).0, .versionChosen(.current)).0.detail, text: text))

        #expect(current.version == .current && current.notes == .markdown("new", made: nil) && current.transcriptMark == nil)
        #expect(previous.version == .previous && previous.notes == .markdown("old", made: nil) && previous.transcriptMark == "mark previous")
        #expect(back.version == .current && back.transcriptMark == nil)
    }

    @Test func notesWithoutAnIdentityAreMarkedOnceARestoreLeavesAPreviousTranscript() throws {
        let legacy = CallNotes(text: "legacy", made: nil)
        let before = read(.init(current: legacy, currentTranscriptIdentity: "now", hasPreviousTranscript: false))
        let (changed, effect) = reducer.reduce(before, .transcriptChanged(id: "call"))
        #expect(effect == .read(id: "call", revision: changed.revision))
        let restored = reducer.reduce(changed, .readFinished(id: "call", revision: changed.revision,
                                                             result: .read(.init(current: legacy, currentTranscriptIdentity: "restored",
                                                                                 hasPreviousTranscript: true)))).0

        #expect(try #require(detailState(before.detail, text: text)).transcriptMark == nil)
        let shown = try #require(detailState(restored.detail, text: text))
        #expect(shown.notes == .markdown("legacy", made: nil) && shown.transcriptMark == "mark current")
    }

    private func read(_ pair: CallNotesPair) -> CallDetailState {
        let (selected, effect) = reducer.reduce(.init(), .selectionChanged(call))
        return reducer.reduce(selected, .readFinished(id: "call", revision: effect.map { if case let .read(_, revision) = $0 { revision } else { 0 } } ?? 0,
                                                      result: .read(pair))).0
    }
}
