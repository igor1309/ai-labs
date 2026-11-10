import AppKit
import Composer
import Testing
@testable import Audelin

@MainActor
struct PreviewPanelTests {
    @Test func aPreviewShowsThePanelWithThatCallAndNoneHidesIt() throws {
        let window = PreviewPanelSpy()
        let panel = PreviewPanel(makePanel: { window }, copy: { _ in })

        panel.show(preview("A"))
        #expect(window.title == "Саммари — A")
        #expect(window.contentView != nil)
        #expect(window.orders == ["front"])

        panel.show(preview("B"))
        #expect(window.title == "Саммари — B")
        #expect(window.orders == ["front", "front"])

        panel.show(nil)
        #expect(window.orders == ["front", "front", "out"])
    }

    @Test func theUtilityPanelFloatsHidesWithTheAppAndKeepsItsPlace() {
        let panel = makeSummaryPanel()
        defer { panel.close() }

        #expect(panel.isFloatingPanel)
        #expect(panel.hidesOnDeactivate)
        #expect(panel.styleMask.isSuperset(of: [.titled, .closable, .resizable, .utilityWindow]))
        #expect(panel.frameAutosaveName == "SummaryPreview")
        #expect(!panel.isReleasedWhenClosed)
        #expect(panel.minSize.width >= 320)
    }

    @Test func copyingPutsTheMarkdownSourceOnThePasteboard() {
        let pasteboard = NSPasteboard.withUniqueName()
        defer { pasteboard.releaseGlobally() }
        let source = "## Итоги\n\n- **важно**\n\n| a | b |\n|---|---|\n"

        copyNotes(source, to: pasteboard)

        #expect(pasteboard.string(forType: .string) == source)
    }
}

private func preview(_ title: String) -> CallsPreview {
    CallsPreview(id: title, title: title, date: "17.10 · 11:00", duration: "28 мин", notes: .text("# \(title)"))
}

@MainActor private final class PreviewPanelSpy: PreviewPanelDriver {
    var title = ""
    var contentView: NSView?
    var orders: [String] = []
    func orderFront(_ sender: Any?) { orders.append("front") }
    func orderOut(_ sender: Any?) { orders.append("out") }
}
