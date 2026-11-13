import AppKit
import CallsListUI
import CallsWindowUI
import Composer
import Observation
import SummaryPreviewUI
import SwiftUI
import Testing
@testable import CallsWindowShell

@MainActor
struct CallsSplitTests {
    @Test func tabMovesTheKeyboardBetweenTheListAndTheDetail() async throws {
        let detail = NSHostingView(rootView: SummaryPreviewView(state: SummaryPreviews.state("notes"), event: { _ in }, render: renderNotes))
        let list = NSHostingView(rootView: CallsListView(state: CallsListPreviews.state("calls"), text: .init(language: .russian),
                                                       event: { _ in }, focusDetail: { focusCallsDetail(in: detail) }))
        let (window, _) = try show(width: 1000, list: list, detail: detail)
        defer { window.close() }
        window.makeKeyAndOrderFront(nil)
        await inputTurn()
        let notes = try #require(textView(in: detail))

        #expect(window.makeFirstResponder(list))
        let tab = try #require(NSEvent.keyEvent(with: .keyDown, location: .zero, modifierFlags: [], timestamp: 0,
                                              windowNumber: window.windowNumber, context: nil, characters: "\t",
                                              charactersIgnoringModifiers: "\t", isARepeat: false, keyCode: 48))
        window.sendEvent(tab)
        await inputTurn()
        #expect(window.firstResponder === notes)
        let field = try #require(searchField(in: list))
        #expect(window.makeFirstResponder(field))
        window.sendEvent(tab)
        await inputTurn()
        #expect(window.firstResponder === notes)
        for _ in 0..<12 where !isInside(window.firstResponder, list) { window.selectNextKeyView(nil); await inputTurn() }
        #expect(isInside(window.firstResponder, list))
    }

    @Test func eachDetailButtonReachesTheCallsWindow() async {
        let events: [SummaryPreviewEvent] = [.copy, .open, .rename, .retrySummary, .delete, .makeSummary, .cancelSummary]
        var sent: [CallsDetailEvent] = []
        await withCheckedContinuation { (done: CheckedContinuation<Void, Never>) in
            let handle = detailSender { sent.append($0); if sent.count == events.count { done.resume() } }
            events.forEach(handle)
        }
        #expect(sent == [.copy, .open, .rename, .retrySummary, .delete, .makeSummary, .cancelSummary])
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
        #expect(detailState(detail(.notes("# A", made: "12 октября, 10:30")), text: russian) == state(.markdown("# A", made: "12 октября, 10:30")))
        #expect(detailState(detail(.unreadable("нет доступа")), text: russian) == state(.unreadable("Итоги не читаются: нет доступа")))
        #expect(detailState(detail(.preparing), text: russian) == state(.making))
        #expect(detailState(detail(.failed(reason: "лимит", canRetry: true)), text: russian) == state(.failed("лимит"), canRetry: true))
        #expect(detailState(detail(.failed(reason: "лимит", canRetry: false)), text: russian) == state(.failed("лимит")))
        #expect(detailState(detail(.notes("# A")), text: russian) == state(.markdown("# A", made: nil)))
        #expect(detailState(detail(.none), text: russian) == state(.none))
    }

    @Test func eachDetailButtonIsTheSameActionOnTheShownCall() {
        let events: [SummaryPreviewEvent] = [.copy, .open, .rename, .retrySummary, .delete, .makeSummary, .cancelSummary]
        #expect(events.map(detailEvent) == [.copy, .open, .rename, .retrySummary, .delete, .makeSummary, .cancelSummary])
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

    @Test func theListStopsWatchingOnlyOnceBothWindowsAreClosed() {
        let center = NotificationCenter()
        let calls = NSObject(), reading = NSObject()
        var open: Set<ObjectIdentifier> = [ObjectIdentifier(calls), ObjectIdentifier(reading)]
        var closes = 0
        onBothClosed(calls, reading, isVisible: { open.contains(ObjectIdentifier($0)) }, center: center) { closes += 1 }

        open.remove(ObjectIdentifier(calls))
        center.post(name: NSWindow.willCloseNotification, object: calls)
        #expect(closes == 0)
        open.remove(ObjectIdentifier(reading))
        center.post(name: NSWindow.willCloseNotification, object: reading)
        #expect(closes == 1)
    }

    @Test func theNotesRendererDrawsMarkdownInTheViewsStyle() throws {
        let heading = NSFont.boldSystemFont(ofSize: 20), body = NSFont.systemFont(ofSize: 13)
        let style = NotesStyle(body: body, headings: [heading], code: .monospacedSystemFont(ofSize: 12, weight: .regular),
                               text: .red, secondary: .gray, tertiary: .lightGray, codeBackground: .white, rule: .gray)

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

    @Test func theCallsOwnWindowKeepsItsPlaceAndShowsTheDetail() {
        let content = NSView()
        let window = makeCallWindow(content: content, title: { nil })
        defer { window.close() }

        #expect(window.contentView === content)
        #expect(window.frameAutosaveName == "CallWindow" && !window.isReleasedWhenClosed)
        #expect(window.styleMask.isSuperset(of: [.titled, .closable, .resizable]))
    }

    @Test func theCallsWindowTitleFollowsTheCall() async {
        let source = TitleSource()
        let titles = TitleSpy()
        let following = followTitle({ source.title }) { titles.set($0) }
        defer { following.cancel() }

        await titles.wait(1)
        source.title = "Синк по OKR"
        await titles.wait(2)
        source.title = nil
        await titles.wait(3)

        #expect(titles.values == ["Запуск", "Синк по OKR", ""])
    }

    private func inputTurn() async {
        await withCheckedContinuation { continuation in
            DispatchQueue.main.async { continuation.resume() }
        }
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

private func searchField(in view: NSView) -> NSSearchField? {
    (view as? NSSearchField) ?? view.subviews.lazy.compactMap(searchField).first
}

private func isInside(_ responder: NSResponder?, _ view: NSView) -> Bool {
    if let editor = responder as? NSTextView, editor.isFieldEditor, let control = editor.delegate as? NSView {
        return control.isDescendant(of: view)
    }
    return (responder as? NSView)?.isDescendant(of: view) ?? false
}

@MainActor @Observable private final class TitleSource { var title: String? = "Запуск" }

@MainActor private final class TitleSpy {
    private(set) var values: [String] = []
    private var waiters: [(count: Int, resume: () -> Void)] = []
    func set(_ title: String) {
        values.append(title)
        let ready = waiters.filter { $0.count <= values.count }
        waiters.removeAll { $0.count <= values.count }
        ready.forEach { $0.resume() }
    }
    func wait(_ count: Int) async {
        if values.count >= count { return }
        await withCheckedContinuation { continuation in waiters.append((count, { continuation.resume() })) }
    }
}
