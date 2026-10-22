import AppKit
import GlassLedger
import SwiftUI
import Testing
@testable import PanelUI

@MainActor
struct TranscriptLogTests {

    @Test func showsTheLateGroupThenTheEntries() throws {

        let text = try #require(Offscreen.textView(in: hosted(PanelState.Lines(
            late: .init(span: "12:30–12:33", entries: [
                .init(id: 1, time: "12:31", speaker: .them, settled: "Всем привет."),
            ]),
            entries: entries()
        ))))

        let order = ["дописано позже · 12:30–12:33", "Всем привет.", "Accountable — я.", "по запуску"]
            .map { (text.string as NSString).range(of: $0).location }

        #expect(!order.contains(NSNotFound), "\(text.string)")
        #expect(order == order.sorted())
    }

    @Test func keepsASelectionWhileTextSettlesAndLinesArrive() throws {

        let host = hosted(.init(entries: entries(pending: "accountable за слог")))
        let text = try #require(Offscreen.textView(in: host))
        let selected = (text.string as NSString).range(of: "Accountable — я.")
        text.setSelectedRange(selected)

        host.rootView = log(.init(entries: entries(settledTail: " accountable за слог поддержки?", extra: true)))
        host.layoutSubtreeIfNeeded()

        #expect(text.selectedRange() == selected)
        #expect((text.string as NSString).substring(with: text.selectedRange()) == "Accountable — я.")
    }

    @Test func holdsWhatADragSelectedAndIgnoresAClick() throws {

        var events: [PanelEvent] = []
        let host = hosted(.init(entries: entries()), event: { events.append($0) })
        let text = try #require(Offscreen.textView(in: host) as? LogTextView)

        text.setSelectedRange((text.string as NSString).range(of: "команда Ильи"))
        text.selectionEnded?()
        #expect(text.selectedRange().length == 0, "the held text stays selected")

        text.setSelectedRange(NSRange(location: 3, length: 0))
        text.selectionEnded?()

        #expect(events == [.hold(.init(entryID: 2, text: "команда Ильи"))])
    }

    @Test func holdsASelectionAcrossEntriesWithoutTheGutter() throws {

        var events: [PanelEvent] = []
        let host = hosted(.init(entries: entries()), event: { events.append($0) })
        let text = try #require(Offscreen.textView(in: host) as? LogTextView)
        let string = text.string as NSString
        let from = string.range(of: "команда Ильи.").location
        let to = NSMaxRange(string.range(of: "по запуску"))

        text.setSelectedRange(NSRange(location: from, length: to - from))
        text.selectionEnded?()

        #expect(events == [.hold(.init(entryID: 2, text: "команда Ильи.\nпо запуску"))])
    }

    @Test func fadesAHeldSelectionAway() async throws {

        let text = try #require(Offscreen.textView(in: hosted(.init(entries: entries()))) as? LogTextView)
        let fading = { text.subviews.filter { $0 is NSImageView } }

        text.setSelectedRange((text.string as NSString).range(of: "команда Ильи"))
        text.selectionEnded?()
        #expect(fading().count == 1, "the selection clears without fading")

        try await Task.sleep(for: .seconds(LogTextView.fade + 0.2))
        #expect(fading().isEmpty, "the faded picture stays over the text")
    }

    @Test func followsTheNewestLine() throws {

        let host = hosted(.init(entries: many(12)), height: 160)
        let scroll = try #require(scrollView(in: host))

        host.rootView = log(.init(entries: many(14)))
        host.layoutSubtreeIfNeeded()

        #expect(isTallerThanItsView(scroll))
        #expect(isAtBottom(scroll), "the newest line is out of view")
    }

    @Test func staysWhereTheReaderScrolled() throws {

        let host = hosted(.init(entries: many(12), followsLive: false), height: 160)
        let scroll = try #require(scrollView(in: host))
        scroll.contentView.scroll(to: .zero)

        host.rootView = log(.init(entries: many(14), followsLive: false))
        host.layoutSubtreeIfNeeded()

        #expect(isTallerThanItsView(scroll))
        #expect(scroll.contentView.bounds.origin.y == 0, "the log moved under the reader")
    }

    @Test func reportsScrollingAwayFromTheNewestLineAndBack() throws {

        var events: [PanelEvent] = []
        let host = hosted(.init(entries: many(12)), height: 160, event: { events.append($0) })
        let scroll = try #require(scrollView(in: host))

        scroll.contentView.scroll(to: .zero)
        scroll.documentView?.scrollToEndOfDocument(nil)

        #expect(events == [.scrolled(atBottom: false), .scrolled(atBottom: true)])
    }

    @Test func hugsAShortLogAndScrollsALongOne() throws {

        let short = Offscreen.host(log(.init(entries: entries()), height: nil)).fittingSize.height
        let longer = Offscreen.host(log(.init(entries: many(4)), height: nil)).fittingSize.height
        let capped = Offscreen.host(log(.init(entries: many(40)), height: nil).frame(maxHeight: 300)).fittingSize.height

        #expect(short > 0)
        #expect(longer > short, "the log does not grow with its text")
        #expect(capped <= 300, "the log does not scroll inside the room it has")
    }

    // MARK: - Helpers

    private func entries(
        pending: String = "",
        settledTail: String = "",
        extra: Bool = false
    ) -> [PanelState.Entry] {

        var entries: [PanelState.Entry] = [
            .init(id: 2, time: "12:42", speaker: .me, settled: "Accountable — я. По слог отвечает команда Ильи."),
            .init(id: 3, time: "12:43", speaker: .them, settled: "по запуску — кто у нас" + settledTail, pending: pending),
        ]
        if extra {
            entries.append(.init(id: 4, time: "12:44", speaker: .me, settled: "Я.", pending: "по слог"))
        }
        return entries
    }

    private func many(_ count: Int) -> [PanelState.Entry] {

        (0..<count).map {
            .init(id: $0, time: "12:\(40 + $0)", speaker: $0.isMultiple(of: 2) ? .me : .them, settled: "Фраза номер \($0), чтобы было что читать.")
        }
    }

    private func log(
        _ lines: PanelState.Lines,
        height: CGFloat? = 260,
        event: @escaping (PanelEvent) -> Void = { _ in }
    ) -> AnyView {

        let config = PanelConfig.glassLedger
        return AnyView(
            TranscriptLog(lines: lines, tokens: .light, config: config, event: event)
                .frame(width: config.panelWidth, height: height)
                .background(GlassLedger.light.glass)
                .environment(\.colorScheme, .light)
        )
    }

    private func hosted(
        _ lines: PanelState.Lines,
        height: CGFloat = 260,
        event: @escaping (PanelEvent) -> Void = { _ in }
    ) -> NSHostingView<AnyView> {

        Offscreen.host(log(lines, height: height, event: event))
    }

    private func scrollView(in view: NSView) -> NSScrollView? {

        if let scroll = view as? NSScrollView { return scroll }
        return view.subviews.lazy.compactMap(scrollView(in:)).first
    }

    private func isTallerThanItsView(_ scroll: NSScrollView) -> Bool {

        (scroll.documentView?.bounds.height ?? 0) > scroll.contentView.bounds.height
    }

    private func isAtBottom(_ scroll: NSScrollView) -> Bool {

        guard let document = scroll.documentView else { return false }
        return scroll.contentView.documentVisibleRect.maxY >= document.bounds.height - 1
    }
}
