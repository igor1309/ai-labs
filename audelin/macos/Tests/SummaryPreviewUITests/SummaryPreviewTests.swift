import AppKit
import GlassLedger
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
        let window = NSWindow(contentRect: NSRect(x: -30_000, y: -30_000, width: size.width, height: size.height),
                              styleMask: .borderless, backing: .buffered, defer: false)
        window.isReleasedWhenClosed = false
        defer { window.close() }
        window.contentView = NSHostingView(rootView: SummaryPreviewView(state: SummaryPreviews.state("notes"), copy: { copies += 1 }))
        window.orderFrontRegardless()
        RunLoop.main.run(until: Date() + 0.15)

        // The button sits at the header's top right, inside its padding.
        let location = NSPoint(x: size.width - 16 - 20, y: size.height - 16 - 12)
        for type in [NSEvent.EventType.leftMouseDown, .leftMouseUp] {
            window.sendEvent(NSEvent.mouseEvent(with: type, location: location, modifierFlags: [], timestamp: ProcessInfo.processInfo.systemUptime,
                                                windowNumber: window.windowNumber, context: nil, eventNumber: 0, clickCount: 1, pressure: 1)!)
        }
        RunLoop.main.run(until: Date() + 0.15)

        #expect(copies == 1)
    }

    @Test func unreadableNotesOfferNoTextAndNoCopy() throws {

        let host = Offscreen.host(view(SummaryPreviews.state("unreadable")), size: size)

        #expect(Offscreen.textView(in: host) == nil)
    }

    // MARK: - Helpers

    private let size = CGSize(width: 440, height: 560)

    private func view(_ state: SummaryPreviewState, scheme: ColorScheme = .light) -> some View {
        GlassLedger.registerFonts()
        return SummaryPreviewView(state: state, copy: {}).environment(\.colorScheme, scheme)
    }
}
