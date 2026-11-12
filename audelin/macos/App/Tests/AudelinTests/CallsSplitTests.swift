import AppKit
import CallsListUI
import Composer
import SummaryPreviewUI
import SwiftUI
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
        let list = NSHostingView(rootView: CallsListView(state: CallsListPreviews.state("calls"), text: .init(language: .russian), event: { _ in }))
        let detail = NSHostingView(rootView: SummaryPreviewView(state: SummaryPreviews.state("notes"), event: { _ in }, render: renderNotes))
        let (window, _) = try show(width: 1000, list: list, detail: detail)
        defer { window.close() }
        window.makeKeyAndOrderFront(nil)
        RunLoop.main.run(until: Date() + 0.2)
        let notes = try #require(textView(in: detail))

        #expect(window.makeFirstResponder(list))
        for _ in 0..<12 where window.firstResponder !== notes { window.selectNextKeyView(nil) }
        #expect(window.firstResponder === notes)
        for _ in 0..<12 where !isInside(window.firstResponder, list) { window.selectNextKeyView(nil) }
        #expect(isInside(window.firstResponder, list))
    }

    @Test func eachDetailButtonReachesTheCallsWindow() async {
        let events: [SummaryPreviewEvent] = [.copy, .open, .rename, .retrySummary, .delete]
        var sent: [CallsDetailEvent] = []
        await withCheckedContinuation { (done: CheckedContinuation<Void, Never>) in
            let handle = detailSender { sent.append($0); if sent.count == events.count { done.resume() } }
            events.forEach(handle)
        }
        #expect(sent == [.copy, .open, .rename, .retrySummary, .delete])
    }

    @Test func theDetailShowsTheSelectedCallsStateAndNothingSelected() {
        let russian = SummaryPreviewText(language: .russian)
        func detail(_ content: CallsDetail.Content) -> CallsDetail {
            .init(id: "A", title: "Zoom", date: "Сегодня, 10:00", duration: "28:00", content: content)
        }
        func state(_ notes: SummaryPreviewState.Notes, canRetry: Bool = false) -> SummaryPreviewState {
            .init(title: "Zoom", date: "Сегодня, 10:00", duration: "28:00", notes: notes, canRetry: canRetry)
        }

        #expect(detailState(nil, text: russian) == nil)
        #expect(detailState(detail(.notes("# A")), text: russian) == state(.markdown("# A")))
        #expect(detailState(detail(.unreadable("нет доступа")), text: russian) == state(.unreadable("Итоги не читаются: нет доступа")))
        #expect(detailState(detail(.preparing), text: russian) == state(.preparing))
        #expect(detailState(detail(.failed(reason: "лимит", canRetry: true)), text: russian) == state(.failed("лимит"), canRetry: true))
        #expect(detailState(detail(.failed(reason: "лимит", canRetry: false)), text: russian) == state(.failed("лимит")))
        #expect(detailState(detail(.none(notesOff: true)), text: russian) == state(.none(notesOff: true)))
    }

    @Test func eachDetailButtonIsTheSameActionOnTheShownCall() {
        let events: [SummaryPreviewEvent] = [.copy, .open, .rename, .retrySummary, .delete]
        #expect(events.map(detailEvent) == [.copy, .open, .rename, .retrySummary, .delete])
    }

    @Test func closingTheCallsWindowTellsTheList() {
        let center = NotificationCenter()
        let window = NSObject(), other = NSObject()
        var closes = 0
        onClose(of: window, center: center) { closes += 1 }

        center.post(name: NSWindow.willCloseNotification, object: other)
        #expect(closes == 0)
        center.post(name: NSWindow.willCloseNotification, object: window)
        #expect(closes == 1)
    }

    @Test func theNotesRendererDrawsMarkdownInTheViewsStyle() throws {
        let heading = NSFont.boldSystemFont(ofSize: 20), body = NSFont.systemFont(ofSize: 13)
        let style = NotesStyle(body: body, headings: [heading], code: .monospacedSystemFont(ofSize: 12, weight: .regular),
                               text: .red, secondary: .gray, codeBackground: .white, rule: .gray)

        let rendered = renderNotes("# Итоги\n\nтекст", style)

        #expect(rendered.string == "Итоги\nтекст")
        #expect(rendered.attribute(.font, at: 0, effectiveRange: nil) as? NSFont == heading)
        let bodyAt = (rendered.string as NSString).range(of: "текст").location
        #expect(rendered.attribute(.font, at: bodyAt, effectiveRange: nil) as? NSFont == body)
        #expect(rendered.attribute(.foregroundColor, at: bodyAt, effectiveRange: nil) as? NSColor == .red)
    }

    @Test func copyPutsTheNotesMarkdownOnThePasteboard() {
        let pasteboard = NSPasteboard.withUniqueName()
        defer { pasteboard.releaseGlobally() }
        let source = "## Итоги\n\n- **важно**\n\n| a | b |\n|---|---|\n"

        copyNotes(source, to: pasteboard)

        #expect(pasteboard.string(forType: .string) == source)
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

private func textView(in view: NSView) -> NSTextView? {
    (view as? NSTextView) ?? view.subviews.lazy.compactMap(textView).first
}

private func isInside(_ responder: NSResponder?, _ view: NSView) -> Bool {
    (responder as? NSView)?.isDescendant(of: view) ?? false
}
