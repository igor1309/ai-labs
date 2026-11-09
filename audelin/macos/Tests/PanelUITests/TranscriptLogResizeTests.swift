import AppKit
import GlassLedger
import SwiftUI
import RenderedText
import Testing
@testable import PanelUI

@MainActor
struct TranscriptLogResizeTests {

    @Test func resizingALongLiveLogKeepsItsLastLineVisible() throws {
        let history = (0..<120).map { index in
            PanelState.Entry(id: index, time: "03:24", speaker: .them,
                settled: String(repeating: "Обсуждаем план работ и следующий релиз. ", count: 1 + index % 7))
        }
        func panel(_ width: CGFloat) -> AnyView {
            var config = PanelConfig.glassLedger
            config.panelWidth = width
            return AnyView(PanelView(state: .init(recording: .on(elapsed: "00:11:26"),
                log: .lines(.init(entries: history))), event: { _ in }, config: config)
                .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top))
        }
        let host = Offscreen.host(panel(396), size: CGSize(width: 396, height: 560))
        let window = try #require(host.window)
        let text = try #require(Offscreen.textView(in: host))
        let scroll = try #require(scrollView(in: host))
        let originalText = text.string
        for width: CGFloat in [500, 320, 600, 396, 550, 340] {
            host.rootView = panel(width)
            window.setContentSize(CGSize(width: width, height: 560))
            host.layoutSubtreeIfNeeded()
            // TextKit can temporarily return no segment while the resized
            // viewport is being laid out. Wait for geometry, not a fixed
            // runner-speed-dependent delay; never scroll the view in the test.
            let started = Date.now
            let deadline = started.addingTimeInterval(2)
            var last = NSRect.zero
            repeat {
                RunLoop.main.run(until: .now.addingTimeInterval(0.01))
                host.layoutSubtreeIfNeeded()
                host.display()
                last = text.firstRect(forCharacterRange: NSRange(location: text.string.utf16.count - 1, length: 1), actualRange: nil)
            } while last.isEmpty && Date.now < deadline
            #expect(text.string == originalText, "Resize duplicated or lost transcript text")
            let visible = scroll.convert(scroll.contentView.bounds, from: scroll.contentView)
            let screen = window.convertToScreen(scroll.convert(visible, to: nil))
            #expect(last.intersects(screen), """
                last line disappeared at width \(width): \(last), viewport \(screen); \(layoutReport(text, waitedSince: started))
                """)
        }
    }

    @Test func aLongLogWithALegacyScrollerIsLaidOutAtTheWidthItShows() throws {

        let history = (0..<120).map { index in
            PanelState.Entry(id: index, time: "03:24", speaker: .them,
                settled: String(repeating: "Обсуждаем план работ и следующий релиз. ", count: 1 + index % 7))
        }
        func panel(_ width: CGFloat) -> AnyView {
            var config = PanelConfig.glassLedger
            config.panelWidth = width
            return AnyView(PanelView(state: .init(recording: .on(elapsed: "00:11:26"),
                log: .lines(.init(entries: history))), event: { _ in }, config: config)
                .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top))
        }
        let host = Offscreen.host(panel(500), size: CGSize(width: 500, height: 560))
        let window = try #require(host.window)
        let text = try #require(Offscreen.textView(in: host))
        let scroll = try #require(scrollView(in: host))
        scroll.scrollerStyle = .legacy
        for width: CGFloat in [500, 320, 600, 340] {
            host.rootView = panel(width)
            window.setContentSize(CGSize(width: width, height: 560))
            host.layoutSubtreeIfNeeded()
            let clip = scroll.contentView.bounds.width
            #expect(clip < scroll.frame.width, "the legacy scroller takes no room at width \(width)")
            #expect(text.frame.width == clip, "text is \(text.frame.width) wide in a \(clip) clip at width \(width)")
        }
    }

    private func scrollView(in view: NSView) -> NSScrollView? {

        if let scroll = view as? NSScrollView { return scroll }
        return view.subviews.lazy.compactMap(scrollView(in:)).first
    }
}


/// What a missing last line needs explained: how long the test waited and
/// how far TextKit had laid the text out.
@MainActor
private func layoutReport(_ text: NSTextView, waitedSince started: Date) -> String {

    let waited = String(format: "%.3f", Date.now.timeIntervalSince(started))
    var report = "waited \(waited) s, text frame \(text.frame), visible \(text.visibleRect), "
        + "window visible \(text.window?.isVisible ?? false), length \(text.string.utf16.count)"
    guard let layout = text.textLayoutManager else { return report + ", no TextKit 2 layout manager" }
    report += ", usage bounds \(layout.usageBoundsForTextContainer)"
    if let viewport = layout.textViewportLayoutController.viewportRange, let content = layout.textContentManager {
        let start = content.offset(from: content.documentRange.location, to: viewport.location)
        let end = content.offset(from: content.documentRange.location, to: viewport.endLocation)
        report += ", viewport characters \(start)..<\(end)"
    } else {
        report += ", no viewport range"
    }
    if let content = layout.textContentManager {
        let lastCharacter = content.location(content.documentRange.endLocation, offsetBy: -1)
        let fragment = lastCharacter.flatMap { layout.textLayoutFragment(for: $0) }
        report += ", last line's fragment \(fragment.map { "\($0.state.rawValue) at \($0.layoutFragmentFrame)" } ?? "none")"
    }
    return report
}
