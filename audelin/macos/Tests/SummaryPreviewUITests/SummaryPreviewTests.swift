import AppKit
import GlassLedger
import NotesMarkdown
import RenderedText
import SummaryPreviewUI
import SwiftUI
import Testing

@MainActor
struct SummaryPreviewTests {

    @Test(arguments: SummaryPreviews.states.map(\.name), [ColorScheme.light, .dark])
    func drawsAsItsReference(name: String, scheme: ColorScheme) throws {

        let host = Offscreen.host(view(SummaryPreviews.state(name), scheme: scheme), size: size, scheme: scheme)
        let image = try #require(Offscreen.snapshot(host))
        let url = URL(fileURLWithPath: #filePath).deletingLastPathComponent()
            .appendingPathComponent("References/\(name)-\(scheme == .dark ? "dark" : "light").png")

        let outcome = try ReferenceImage.compare(image, with: url)
        #expect(outcome == .matches || outcome == .recorded)
    }

    @Test func anySelectedPartCopiesExactlyThatPart() throws {

        let host = Offscreen.host(view(SummaryPreviews.state("notes")), size: size)
        let text = try #require(Offscreen.textView(in: host))
        let pasteboard = NSPasteboard.withUniqueName()
        defer { pasteboard.releaseGlobally() }
        let range = (text.string as NSString).range(of: "дашборд NPS")

        #expect(text.isSelectable && !text.isEditable)
        text.setSelectedRange(range)
        #expect(text.writeSelection(to: pasteboard, types: text.writablePasteboardTypes))
        #expect(pasteboard.string(forType: .string) == "дашборд NPS")
    }

    @Test func pressingCopyAsksToCopyTheNotes() throws {

        var copies = 0
        click(copyLocation, on: SummaryPreviewView(state: SummaryPreviews.state("notes"), copy: { copies += 1 }, render: markdown))

        #expect(copies == 1)
    }

    @Test func unreadableNotesHaveNoCopyButton() throws {

        var copies = 0
        click(copyLocation, on: SummaryPreviewView(state: SummaryPreviews.state("unreadable"), copy: { copies += 1 }, render: markdown))

        #expect(copies == 0)
    }

    @Test func theNotesAreRenderedWithGlassLedgerFontsAndColours() throws {

        var calls: [(source: String, style: NotesStyle)] = []
        let rendered = NSAttributedString(string: "отрисовано")
        let view = SummaryPreviewView(state: SummaryPreviews.state("notes"), copy: {}) { source, style in
            calls.append((source, style)); return rendered
        }
        let host = Offscreen.host(view, size: size)
        let text = try #require(Offscreen.textView(in: host))
        let tokens = GlassLedger.for(.light)

        let call = try #require(calls.last)
        #expect(call.source == SummaryPreviews.notes)
        #expect(call.style.body.familyName == tokens.fontUi && call.style.body.pointSize == tokens.typeBody)
        #expect(call.style.code.familyName == tokens.fontData)
        #expect(call.style.headings.allSatisfy { $0.familyName == tokens.fontUi })
        #expect(call.style.text == NSColor(tokens.text))
        #expect(text.string == "отрисовано")
    }

    @Test func unreadableNotesRenderNothing() throws {

        var calls = 0
        let view = SummaryPreviewView(state: SummaryPreviews.state("unreadable"), copy: {}) { _, _ in calls += 1; return .init() }
        _ = Offscreen.host(view, size: size)

        #expect(calls == 0)
    }

    @Test func unreadableNotesOfferNoTextAndNoCopy() throws {

        let host = Offscreen.host(view(SummaryPreviews.state("unreadable")), size: size)

        #expect(Offscreen.textView(in: host) == nil)
    }

    // MARK: - Helpers

    private let size = CGSize(width: 440, height: 560)

    // The header's top right, inside its padding, where the copy button sits.
    private var copyLocation: NSPoint { NSPoint(x: size.width - 16 - 20, y: size.height - 16 - 12) }

    private func view(_ state: SummaryPreviewState, scheme: ColorScheme = .light) -> some View {
        SummaryPreviewView(state: state, copy: {}, render: markdown).environment(\.colorScheme, scheme)
    }

    private func click(_ location: NSPoint, on view: SummaryPreviewView) {
        let window = NSWindow(contentRect: NSRect(x: -30_000, y: -30_000, width: size.width, height: size.height),
                              styleMask: .borderless, backing: .buffered, defer: false)
        window.isReleasedWhenClosed = false
        defer { window.close() }
        window.contentView = NSHostingView(rootView: view)
        window.orderFrontRegardless()
        RunLoop.main.run(until: Date() + 0.15)
        for type in [NSEvent.EventType.leftMouseDown, .leftMouseUp] {
            window.sendEvent(NSEvent.mouseEvent(with: type, location: location, modifierFlags: [], timestamp: ProcessInfo.processInfo.systemUptime,
                                                windowNumber: window.windowNumber, context: nil, eventNumber: 0, clickCount: 1, pressure: 1)!)
        }
        RunLoop.main.run(until: Date() + 0.15)
    }
}

/// The renderer the app composes the view with.
private func markdown(_ source: String, _ style: NotesStyle) -> NSAttributedString {
    NotesMarkdown.render(source, style: .init(body: style.body, headings: style.headings, code: style.code, text: style.text,
                                              secondary: style.secondary, codeBackground: style.codeBackground, rule: style.rule))
}
