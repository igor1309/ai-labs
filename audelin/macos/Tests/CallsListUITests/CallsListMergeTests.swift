import AppKit
import CallsListUI
import SwiftUI
import Testing

/// What a click on a row sends in merge mode, through the list shown far off
/// the visible screen, as the other click tests do.
@MainActor
struct CallsListMergeTests {

    @Test func S3_aClickInMergeModeMarksTheRow() throws {
        let shown = CallsListNotesTests.Shown(with(merge: .init()))
        defer { shown.close() }
        let row = try #require(shown.row("2026.10.20-1600"))
        shown.click(CGPoint(x: 200, y: row.midY))
        #expect(shown.sent == [.toggleMark("2026.10.20-1600")])
    }

    @Test func S6_aClickWhileMergingSendsNothing() throws {
        let shown = CallsListNotesTests.Shown(with(merge: .init(marked: ["2026.10.21-1230", "2026.10.20-1600"], running: true)))
        defer { shown.close() }
        let row = try #require(shown.row("2026.10.17-1100"))
        shown.click(CGPoint(x: 200, y: row.midY))
        #expect(shown.sent.isEmpty)
    }

    @Test func S9_afterMergeModeAClickReadsACallAgain() throws {
        let shown = CallsListNotesTests.Shown(with(merge: nil))
        defer { shown.close() }
        let row = try #require(shown.row("2026.10.20-1600"))
        shown.click(CGPoint(x: 200, y: row.midY))
        #expect(shown.sent == [.select("2026.10.20-1600")])
    }

    @Test func aRowHasNoMenuInMergeMode() throws {
        let shown = CallsListNotesTests.Shown(with(merge: .init()))
        defer { shown.close() }
        let menu = try #require(shown.target("2026.10.20-1600")).menu(for: try #require(NSEvent.mouseEvent(
            with: .rightMouseDown, location: .zero, modifierFlags: [], timestamp: 0,
            windowNumber: 0, context: nil, eventNumber: 0, clickCount: 1, pressure: 1)))
        #expect(menu?.items.isEmpty ?? true)
        #expect(shown.sent.isEmpty)
    }

    private func with(merge: CallsListState.Merge?) -> CallsListState {
        var state = CallsListPreviews.state("calls"); state.merge = merge; return state
    }
}

/// The merge bar's keys: Return merges and Escape leaves; in the far-apart
/// warning Return merges anyway and Escape goes back.
@MainActor
struct CallsListMergeBarTests {

    @Test func S10_withTwoMarkedTheButtonConfirms() throws {
        let shown = CallsListNotesTests.Shown(marked(["2026.10.21-1230", "2026.10.20-1600"]))
        defer { shown.close() }
        shown.type("\r", code: 36)
        #expect(shown.sent == [.confirmMerge])
    }

    @Test func S10_withOneMarkedTheButtonSendsNothing() throws {
        let shown = CallsListNotesTests.Shown(marked(["2026.10.21-1230"]))
        defer { shown.close() }
        shown.type("\r", code: 36)
        #expect(shown.sent.isEmpty)
    }

    @Test func S9_escapeLeavesMergeMode() throws {
        let shown = CallsListNotesTests.Shown(marked(["2026.10.21-1230"]))
        defer { shown.close() }
        shown.type("\u{1B}", code: 53)
        #expect(shown.sent == [.leaveMerge])
    }

    @Test func S5_eachWarningChoiceSendsItsEvent() throws {
        var state = marked(["2026.10.21-1230", "2026.10.17-1100"])
        state.merge?.warning = "between"
        let shown = CallsListNotesTests.Shown(state)
        defer { shown.close() }
        shown.type("\r", code: 36)
        shown.type("\u{1B}", code: 53)
        #expect(shown.sent == [.mergeAnyway, .goBackFromWarning])
    }

    private func marked(_ ids: Set<String>) -> CallsListState {
        var state = CallsListPreviews.state("calls"); state.merge = .init(marked: ids); return state
    }
}
