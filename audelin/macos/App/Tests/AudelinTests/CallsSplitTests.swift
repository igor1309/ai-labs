import AppKit
import Composer
import SummaryPreviewUI
import Testing
@testable import Audelin

@MainActor
struct CallsSplitTests {
    @Test func theListStartsAt340AndTheDividerStaysBetween280And420() throws {
        let (window, split) = try show(width: 1000)
        defer { window.close() }
        let list = split.splitViewItems[0].viewController.view

        #expect(list.frame.width == 340)
        split.splitView.setPosition(200, ofDividerAt: 0)
        split.splitView.layoutSubtreeIfNeeded()
        #expect(list.frame.width == 280)
        split.splitView.setPosition(600, ofDividerAt: 0)
        split.splitView.layoutSubtreeIfNeeded()
        #expect(list.frame.width == 420)
        #expect(split.splitViewItems[1].viewController.view.frame.width == 1000 - 420 - split.splitView.dividerThickness)
    }

    @Test func theDividerIsWhereItWasLeft() throws {
        let defaults = try #require(UserDefaults(suiteName: "CallsSplitTests-\(UUID())"))
        let (first, split) = try show(width: 1000, defaults: defaults)
        split.splitView.setPosition(390, ofDividerAt: 0)
        split.splitView.layoutSubtreeIfNeeded()
        first.close()

        let (again, restored) = try show(width: 1000, defaults: defaults)
        defer { again.close() }

        #expect(restored.splitViewItems[0].viewController.view.frame.width == 390)
        #expect(restored.splitViewItems.map(\.canCollapse) == [false, false])
    }

    @Test func tabMovesTheKeyboardBetweenTheListAndTheDetail() throws {
        let list = Focusable(), detail = Focusable()
        let (window, _) = try show(width: 1000, list: list, detail: detail)
        defer { window.close() }

        #expect(window.makeFirstResponder(list))
        window.selectNextKeyView(nil)
        #expect(window.firstResponder === detail)
        window.selectNextKeyView(nil)
        #expect(window.firstResponder === list)
    }

    @Test func theDetailShowsTheSelectedCallsStateAndNothingSelected() {
        func detail(_ content: CallsDetail.Content) -> CallsDetail {
            .init(id: "A", title: "Zoom", date: "Сегодня, 10:00", duration: "28:00", content: content)
        }
        func state(_ notes: SummaryPreviewState.Notes, canRetry: Bool = false) -> SummaryPreviewState {
            .init(title: "Zoom", date: "Сегодня, 10:00", duration: "28:00", notes: notes, canRetry: canRetry)
        }

        #expect(detailState(nil) == nil)
        #expect(detailState(detail(.notes("# A"))) == state(.markdown("# A")))
        #expect(detailState(detail(.unreadable("нет доступа"))) == state(.unreadable("нет доступа")))
        #expect(detailState(detail(.preparing)) == state(.preparing))
        #expect(detailState(detail(.failed(reason: "лимит", canRetry: true))) == state(.failed("лимит"), canRetry: true))
        #expect(detailState(detail(.failed(reason: "лимит", canRetry: false))) == state(.failed("лимит")))
        #expect(detailState(detail(.none(notesOff: true))) == state(.none(notesOff: true)))
    }

    @Test func eachDetailButtonIsTheSameActionOnTheShownCall() {
        let events: [SummaryPreviewEvent] = [.copy, .open, .rename, .retrySummary, .delete]
        #expect(events.map(detailEvent) == [.copy, .open, .rename, .retrySummary, .delete])
    }

    private func show(width: CGFloat, list: NSView = NSView(), detail: NSView = NSView(),
                      defaults: UserDefaults? = nil) throws -> (NSWindow, NSSplitViewController) {
        let defaults = try defaults ?? #require(UserDefaults(suiteName: "CallsSplitTests-\(UUID())"))
        let split = makeCallsSplit(list: list, detail: detail, defaults: defaults)
        let window = NSWindow(contentRect: NSRect(x: -30_000, y: -30_000, width: width, height: 560),
                              styleMask: [.titled, .resizable], backing: .buffered, defer: false)
        window.isReleasedWhenClosed = false
        window.contentViewController = split
        window.setContentSize(NSSize(width: width, height: 560))
        split.view.layoutSubtreeIfNeeded()
        return (window, split)
    }
}

private final class Focusable: NSView {
    override var acceptsFirstResponder: Bool { true }
    override var canBecomeKeyView: Bool { true }
}
