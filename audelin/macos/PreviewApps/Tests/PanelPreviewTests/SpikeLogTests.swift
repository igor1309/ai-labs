import AppKit
import GlassLedger
import PanelUI
import SwiftUI
import Testing
@testable import PanelPreview

/// What the AppKit log spike has to prove before it replaces the SwiftUI log.
@MainActor
struct SpikeLogTests {

    @Test func drawsInAnOffscreenWindow() throws {

        let host = hosted(lines(pending: "accountable за слог"))
        let image = try #require(snapshot(host))

        #expect(inkedPixels(image) > 2_000, "the log drew nothing")
        try save(image, "spike-log")
    }

    @Test func keepsASelectionWhileTextSettlesAndLinesArrive() throws {

        let host = hosted(lines(pending: "accountable за слог"))
        let text = try #require(textView(in: host))
        let string = text.string as NSString
        let selected = string.range(of: "Accountable — я.")
        text.setSelectedRange(selected)

        host.rootView = log(lines(pending: "", settledTail: " accountable за слог поддержки?", extra: true))
        host.layoutSubtreeIfNeeded()

        #expect(text.selectedRange() == selected)
        #expect((text.string as NSString).substring(with: text.selectedRange()) == "Accountable — я.")
    }

    @Test func reportsASelectionAcrossEntriesWithoutTheGutter() throws {

        var reported: PanelState.Held?
        let host = hosted(lines(pending: ""), select: { reported = $0 })
        let text = try #require(textView(in: host))
        let string = text.string as NSString
        let from = string.range(of: "команда Ильи.").location
        let to = NSMaxRange(string.range(of: "по запуску"))
        text.setSelectedRange(NSRange(location: from, length: to - from))

        #expect(reported?.entryID == 2)
        #expect(reported?.text == "команда Ильи.\nпо запуску")
    }

    // MARK: - Helpers

    private func lines(
        pending: String,
        settledTail: String = "",
        extra: Bool = false
    ) -> PanelState.Lines {

        var entries: [PanelState.Entry] = [
            .init(id: 2, time: "12:42", speaker: .me, settled: "Accountable — я. По слог отвечает команда Ильи."),
            .init(id: 3, time: "12:43", speaker: .them, settled: "по запуску — кто у нас" + settledTail, pending: pending),
        ]
        if extra {
            entries.append(.init(id: 4, time: "12:44", speaker: .me, settled: "Я.", pending: "по слог"))
        }
        return .init(entries: entries)
    }

    private func log(
        _ lines: PanelState.Lines,
        select: @escaping (PanelState.Held?) -> Void = { _ in }
    ) -> AnyView {

        let config = PanelConfig.glassLedger
        return AnyView(
            SpikeLog(
                lines: lines,
                followsLive: false,
                tokens: .light,
                lineHeight: config.lineHeight,
                gutterWidth: config.gutterWidth,
                select: select,
                scrolled: { _ in }
            )
            .frame(width: config.panelWidth, height: 260)
            .background(GlassLedger.light.glass)
            .environment(\.colorScheme, .light)
        )
    }

    private func hosted(
        _ lines: PanelState.Lines,
        select: @escaping (PanelState.Held?) -> Void = { _ in }
    ) -> NSHostingView<AnyView> {

        let host = NSHostingView(rootView: log(lines, select: select))
        let window = NSWindow(
            contentRect: NSRect(x: 0, y: 0, width: 396, height: 260),
            styleMask: .borderless,
            backing: .buffered,
            defer: false
        )
        window.appearance = NSAppearance(named: .aqua)
        window.contentView = host
        host.layoutSubtreeIfNeeded()
        return host
    }

    private func textView(in view: NSView) -> NSTextView? {

        if let text = view as? NSTextView { return text }
        return view.subviews.lazy.compactMap(textView(in:)).first
    }

    private func snapshot(_ view: NSView) -> NSBitmapImageRep? {

        view.display()
        guard let rep = view.bitmapImageRepForCachingDisplay(in: view.bounds) else { return nil }
        view.cacheDisplay(in: view.bounds, to: rep)
        return rep
    }

    /// Pixels clearly darker than the glass background: drawn text.
    private func inkedPixels(_ image: NSBitmapImageRep) -> Int {

        var count = 0
        for y in 0..<image.pixelsHigh {
            for x in 0..<image.pixelsWide {
                if let color = image.colorAt(x: x, y: y), color.brightnessComponent < 0.6 { count += 1 }
            }
        }
        return count
    }

    private func save(_ image: NSBitmapImageRep, _ name: String) throws {

        guard let folder = ProcessInfo.processInfo.environment["AUDELIN_SNAPSHOTS"]
        else { return }

        let png = try #require(image.representation(using: .png, properties: [:]))
        try png.write(to: URL(fileURLWithPath: folder).appendingPathComponent("\(name).png"))
    }
}
