import AppKit
import Composer
import Observation
import SummaryPreviewUI
import Testing
@testable import Audelin

@MainActor
struct PreviewPanelTests {
    @Test func eachPreviewInstallsThatCallsContentAndNoneHidesIt() throws {
        let window = PreviewPanelSpy()
        let content = ContentSpy()
        let panel = PreviewPanel(makePanel: { window }, text: .init(language: .russian), copy: { _ in }, makeContent: content.make)

        panel.show(preview("A"))
        #expect(window.title == "Саммари — A")
        #expect(window.contentView === content.views.last)
        #expect(window.orders == ["front"])

        panel.show(preview("B", notes: .unreadable("нет доступа")))
        #expect(window.title == "Саммари — B")
        #expect(window.contentView === content.views.last)
        #expect(content.states == [
            SummaryPreviewState(title: "A", date: "17.10 · 11:00", duration: "28 мин", notes: .markdown("# A")),
            SummaryPreviewState(title: "B", date: "17.10 · 11:00", duration: "28 мин",
                                notes: .unreadable("Заметки не читаются: нет доступа")),
        ])
        #expect(window.orders == ["front", "front"])

        panel.show(nil)
        #expect(window.orders == ["front", "front", "out"])
    }

    @Test func anEyeMakesThePanelTheActiveWindowAndARowOnlyBringsItForward() {
        let window = PreviewPanelSpy()
        let panel = PreviewPanel(makePanel: { window }, text: .init(language: .russian), copy: { _ in }, makeContent: ContentSpy().make)

        panel.focus()
        #expect(window.orders.isEmpty)
        panel.show(preview("A"))
        panel.show(preview("B"))
        panel.focus()
        #expect(window.orders == ["key", "front", "key"])
        panel.show(nil)
        panel.show(preview("C"))
        #expect(window.orders == ["key", "front", "key", "out", "front"])
    }

    @Test func theCopyButtonPutsTheShownCallsMarkdownOnThePasteboard() throws {
        let pasteboard = NSPasteboard.withUniqueName()
        defer { pasteboard.releaseGlobally() }
        let content = ContentSpy()
        let panel = PreviewPanel(makePanel: { PreviewPanelSpy() }, text: .init(language: .russian), copy: { copyNotes($0, to: pasteboard) },
                                 makeContent: content.make)
        let source = "## Итоги\n\n- **важно**\n\n| a | b |\n|---|---|\n"

        panel.show(preview("A"))
        panel.show(CallsPreview(id: "B", title: "B", date: "", duration: "", notes: .text(source)))
        try #require(content.copies.count == 2)
        content.copies[1]()

        #expect(pasteboard.string(forType: .string) == source)
        content.copies[0]()
        #expect(pasteboard.string(forType: .string) == "# A")
    }

    @Test func thePanelFollowsThePreviewAndBothClosesCloseIt() async {
        let center = NotificationCenter()
        let window = PreviewPanelSpy()
        let source = PreviewSource()
        let panelWindow = NSObject(), callsWindow = NSObject()
        let panel = PreviewPanel(makePanel: { window }, text: .init(language: .russian), copy: { _ in }, makeContent: ContentSpy().make)
        let following = connectPreview(panel: panel, preview: { source.preview }, panelWindow: panelWindow,
                                       callsWindow: callsWindow, center: center,
                                       closePreview: { source.preview = nil; source.closes.append("preview") },
                                       windowClosed: { source.preview = nil; source.closes.append("window") })
        defer { following.cancel() }

        source.preview = preview("A")
        await window.waitForOrders(1)
        #expect(window.title == "Саммари — A")

        center.post(name: NSWindow.willCloseNotification, object: panelWindow)
        await window.waitForOrders(2)
        #expect(source.closes == ["preview"] && window.orders == ["front", "out"])

        source.preview = preview("B")
        await window.waitForOrders(3)
        center.post(name: NSWindow.willCloseNotification, object: callsWindow)
        await window.waitForOrders(4)
        #expect(source.closes == ["preview", "window"] && window.orders == ["front", "out", "front", "out"])
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

    @Test func aLanguageChangeWritesTheShownPreviewAgainWhereItIs() {
        let window = PreviewPanelSpy()
        let content = ContentSpy()
        let panel = PreviewPanel(makePanel: { window }, text: .init(language: .russian), copy: { _ in }, makeContent: content.make)
        panel.languageChanged(.init(language: .english))
        #expect(content.states.isEmpty)
        panel.show(preview("A", notes: .unreadable("denied")))
        panel.languageChanged(.init(language: .english))
        let english = SummaryPreviewText(language: .english)
        #expect(window.title == english(.windowTitle, "A"))
        #expect(content.states.last?.notes == .unreadable(english(.unreadable, "denied")))
        #expect(content.texts.last == english)
        #expect(window.contentView === content.views.last)
        #expect(window.orders == ["front"])
    }

    @Test func thePanelFloatsWithAStandardTitleBarHidesWithTheAppAndKeepsItsPlace() {
        let panel = makeSummaryPanel()
        defer { panel.close() }

        #expect(panel.isFloatingPanel)
        #expect(panel.hidesOnDeactivate)
        #expect(panel.styleMask.isSuperset(of: [.titled, .closable, .resizable]))
        #expect(!panel.styleMask.contains(.utilityWindow))
        #expect(panel.frameAutosaveName == "SummaryPreview")
        #expect(!panel.isReleasedWhenClosed)
        #expect(panel.minSize.width >= 320)
        #expect(!panel.becomesKeyOnlyIfNeeded)
    }
}

private func preview(_ title: String, notes: CallsPreview.Notes? = nil) -> CallsPreview {
    CallsPreview(id: title, title: title, date: "17.10 · 11:00", duration: "28 мин", notes: notes ?? .text("# \(title)"))
}

@MainActor @Observable private final class PreviewSource {
    var preview: CallsPreview?
    @ObservationIgnored var closes: [String] = []
}

@MainActor private final class ContentSpy {
    var states: [SummaryPreviewState] = []
    var texts: [SummaryPreviewText] = []
    var copies: [() -> Void] = []
    var views: [NSView] = []
    func make(_ state: SummaryPreviewState, text: SummaryPreviewText, copy: @escaping () -> Void) -> NSView {
        states.append(state); texts.append(text); copies.append(copy)
        let view = NSView()
        views.append(view)
        return view
    }
}

@MainActor private final class PreviewPanelSpy: PreviewPanelDriver {
    var title = ""
    var contentView: NSView?
    private(set) var orders: [String] = [] {
        didSet {
            let ready = waiters.filter { $0.count <= orders.count }
            waiters.removeAll { $0.count <= orders.count }
            ready.forEach { $0.resume() }
        }
    }
    private var waiters: [(count: Int, resume: () -> Void)] = []
    func orderFront(_ sender: Any?) { orders.append("front") }
    func makeKeyAndOrderFront(_ sender: Any?) { orders.append("key") }
    func orderOut(_ sender: Any?) { orders.append("out") }
    func waitForOrders(_ count: Int) async {
        if orders.count >= count { return }
        await withCheckedContinuation { continuation in waiters.append((count, { continuation.resume() })) }
    }
}
