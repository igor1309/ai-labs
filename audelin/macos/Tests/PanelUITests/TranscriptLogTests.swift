import AppKit
import GlassLedger
import SwiftUI
import Testing
@testable import PanelUI

@MainActor
struct TranscriptLogTests {

    @Test func gapUsesSmallMutedTextAndNamesItsMissingSide() throws {

        for (speaker, label): (PanelState.Speaker, String) in [(.me, "я"), (.them, "они")] {
            let gap = "— диск заполнен с 12:45 —"
            let text = try #require(Offscreen.textView(in: hosted(.init(rows: [
                .entry(.init(id: 1, time: "12:44", speaker: .me, settled: "kept words")),
                .gap(.init(speaker: speaker, text: gap)),
            ]))))
            #expect(text.string.contains("\(label)  \(gap)"))
            #expect(text.string.contains("kept words"))
            let color = try #require(attribute(.foregroundColor, of: gap, in: text) as? NSColor)
            let font = try #require(attribute(.font, of: gap, in: text) as? NSFont)
            #expect(color == NSColor(GlassLedger.light.gutter))
            #expect(font.pointSize == GlassLedger.light.typeCaption)
        }
    }

    @Test func placesALateGroupWhereItsMinutesWere() throws {

        let text = try #require(Offscreen.textView(in: hosted(lateLines)))

        let order = ["Всем привет.", "дописано позже · 12:41–12:42", "Accountable — я.", "Да, и сразу", "по запуску"]
            .map { (text.string as NSString).range(of: $0).location }

        #expect(!order.contains(NSNotFound), "\(text.string)")
        #expect(order == order.sorted(), "\(text.string)")
    }

    @Test func dimsALateGroupWithItsCaption() throws {

        let text = try #require(Offscreen.textView(in: hosted(lateLines)))

        for part in ["дописано позже", "Accountable — я.", "Да, и сразу"] {
            let color = try #require(attribute(.foregroundColor, of: part, in: text) as? NSColor)
            #expect(abs(color.alphaComponent - 0.6) < 0.01, "\(part) is not dimmed")
        }
        let live = try #require(attribute(.foregroundColor, of: "по запуску", in: text) as? NSColor)
        #expect(live.alphaComponent == 1)
    }

    @Test func spacesALateGroupTighterThanTheLog() throws {

        let text = try #require(Offscreen.textView(in: hosted(lateLines)))
        let spacing = { (part: String) in
            (attribute(.paragraphStyle, of: part, in: text) as? NSParagraphStyle)?.paragraphSpacing
        }
        let tokens = GlassLedger.light

        #expect(spacing("дописано позже") == tokens.space8)
        #expect(spacing("Accountable — я.") == tokens.space8)
        #expect(spacing("Всем привет.") == tokens.space12)
    }

    @Test func rulesALateGroupOffFromWhatFollows() throws {

        let text = try #require(Offscreen.textView(in: hosted(lateLines)) as? LogTextView)
        let rules = text.ruleFrames()
        let rule = try #require(rules.first)
        let above = try #require(lineFrame(of: "Да, и сразу", in: text))
        let below = try #require(lineFrame(of: "по запуску", in: text))
        let gap = GlassLedger.light.space12

        #expect(rules.count == 1)
        #expect(rule.height == 1)
        #expect(rule.width == text.bounds.width)
        #expect(abs(rule.minY - above.maxY - gap) < 0.5, "\(above) \(rule)")
        #expect(abs(below.minY - rule.maxY - gap) < 0.5, "\(rule) \(below)")
        // A redraw looks only near what it draws, and finds the same rule.
        #expect(text.ruleFrames(in: rule.insetBy(dx: 0, dy: -2)) == [rule])
        #expect(text.ruleFrames(in: NSRect(x: 0, y: rule.maxY + 200, width: 10, height: 10)).isEmpty)
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

    @Test func eachNewlineCarriesItsParagraphsStyle() throws {

        let lines = PanelState.Lines(entries: many(5) + [.init(id: 5, time: "13:10", speaker: .me, settled: "Последняя.", pending: "по")])
        let string = Transcript(lines: lines, style: .init(tokens: .light, config: .glassLedger)).string
        let text = string.string as NSString

        var newlines = 0
        for index in 1..<text.length where text.character(at: index) == 0x0A {
            newlines += 1
            let own = string.attribute(.paragraphStyle, at: index, effectiveRange: nil) as? NSParagraphStyle
            let before = string.attribute(.paragraphStyle, at: index - 1, effectiveRange: nil) as? NSParagraphStyle
            #expect(own != nil && own == before, "newline at \(index)")
        }
        #expect(newlines >= 5)
    }

    @Test func anUpdateToTheNewestEntryBuildsOnlyItsRow() {

        let style = Transcript.Style(tokens: .light, config: .glassLedger)
        let rows = Transcript.Rows()
        let first = rows.update(.init(entries: many(800) + [newest("по")]), style: style)

        let edit = rows.update(.init(entries: many(800) + [newest("по слог")]), style: style)

        #expect(rows.built == 802)
        // From the newline that opens its paragraph.
        let start = (first.text.string as NSString).range(of: "13:10").location - 1
        #expect(edit.range == NSRange(location: start, length: first.text.length - start))
        #expect(edit.entries.last?.body.location == start + ("\n13:10\tя\t" as NSString).length)
    }

    @Test func unchangedSealedRowsAreNotBuiltAgain() {

        let style = Transcript.Style(tokens: .light, config: .glassLedger)
        let rows = Transcript.Rows()
        _ = rows.update(sealedLines(many(5), live: "по"), style: style)

        let edit = rows.update(sealedLines(many(5), live: "по слог"), style: style)

        #expect(rows.built == 7)
        #expect(edit.entries.count == 6)
        expectApplied(edit, to: sealedLines(many(5), live: "по"), becomes: sealedLines(many(5), live: "по слог"), style: style)
    }

    @Test func aChangedSealedRowIsBuiltFromThere() {

        let style = Transcript.Style(tokens: .light, config: .glassLedger)
        let rows = Transcript.Rows()
        let before = sealedLines(many(5), live: "по")
        _ = rows.update(before, style: style)
        var changed = many(5)
        changed[2] = newest("другое")

        let edit = rows.update(sealedLines(changed, live: "по"), style: style)

        #expect(rows.built == 6 + 4)
        expectApplied(edit, to: before, becomes: sealedLines(changed, live: "по"), style: style)
    }

    @Test func rowsThatJoinTheSealedPartKeepTheirText() {

        let style = Transcript.Style(tokens: .light, config: .glassLedger)
        let rows = Transcript.Rows()
        let entries = many(5)
        let before = sealedLines(Array(entries[..<3]), tail: Array(entries[3...]))
        _ = rows.update(before, style: style)
        let after = sealedLines(entries, tail: [])

        let edit = rows.update(after, style: style)

        #expect(rows.built == 5)
        #expect(edit.text.length == 0)
        #expect(edit.entries.count == 5)
    }

    @Test func aNewAppearanceBuildsEveryRow() {

        let rows = Transcript.Rows()
        let entries = PanelState.Lines(entries: many(3))
        _ = rows.update(entries, style: .init(tokens: .light, config: .glassLedger))

        let edit = rows.update(entries, style: .init(tokens: .dark, config: .glassLedger))

        #expect(rows.built == 6)
        #expect(edit.range.location == 0)
    }

    @Test func applyEditsNothingAboveTheFirstChangedRow() {

        let style = Transcript.Style(tokens: .light, config: .glassLedger)
        let rows = Transcript.Rows()
        let storage = RecordingStorage(rows.update(.init(entries: many(5) + [newest("по")]), style: style).text)
        let edit = rows.update(.init(entries: many(5) + [newest("по слог")]), style: style)

        TranscriptLog.apply(edit, to: storage)

        #expect(storage.string == Transcript(lines: .init(entries: many(5) + [newest("по слог")]), style: style).string.string)
        #expect(!storage.styled.isEmpty)
        #expect(storage.styled.allSatisfy { $0.location >= edit.range.location }, "styled \(storage.styled)")
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
        #expect(settles { isAtBottom(scroll) }, "the newest line is out of view")
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

    /// A live entry, minutes filled in late, then live entries again.
    private var lateLines: PanelState.Lines {

        let live = entries()
        return .init(rows: [
            .entry(.init(id: 1, time: "12:40", speaker: .them, settled: "Всем привет.")),
            .late(.init(span: "12:41–12:42", entries: [
                live[0],
                .init(id: 5, time: "12:42", speaker: .them, settled: "Да, и сразу по слог."),
            ])),
            .entry(live[1]),
        ])
    }

    /// The bounds of the line that holds `part`, in the text view.
    private func lineFrame(of part: String, in text: NSTextView) -> NSRect? {

        let location = (text.string as NSString).range(of: part).location
        guard location != NSNotFound,
              let layout = text.textLayoutManager,
              let content = layout.textContentManager,
              let start = content.location(content.documentRange.location, offsetBy: location),
              let fragment = layout.textLayoutFragment(for: start),
              let line = fragment.textLineFragments.first(where: {
                  $0.characterRange.contains(location - content.offset(from: content.documentRange.location, to: fragment.rangeInElement.location))
              })
        else { return nil }

        let origin = fragment.layoutFragmentFrame.origin
        return line.typographicBounds.offsetBy(dx: origin.x + text.textContainerOrigin.x, dy: origin.y + text.textContainerOrigin.y)
    }

    private func attribute(_ key: NSAttributedString.Key, of part: String, in text: NSTextView) -> Any? {

        let string = text.textStorage!
        let range = (string.string as NSString).range(of: part)
        guard range.location != NSNotFound else { return nil }
        return string.attribute(key, at: range.location, effectiveRange: nil)
    }

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

    private func newest(_ pending: String) -> PanelState.Entry {

        .init(id: 1000, time: "13:10", speaker: .me, settled: "Последняя фраза.", pending: pending)
    }

    private func sealedLines(_ sealed: [PanelState.Entry], live: String) -> PanelState.Lines {

        sealedLines(sealed, tail: [newest(live)])
    }

    private func sealedLines(_ sealed: [PanelState.Entry], tail: [PanelState.Entry]) -> PanelState.Lines {

        .init(rows: .init(sealed: sealed.map(PanelState.Row.entry), tail: tail.map(PanelState.Row.entry)))
    }

    private func expectApplied(
        _ edit: Transcript.Edit, to before: PanelState.Lines, becomes after: PanelState.Lines, style: Transcript.Style
    ) {

        let storage = NSTextStorage(attributedString: Transcript(lines: before, style: style).string)
        TranscriptLog.apply(edit, to: storage)
        #expect(storage.string == Transcript(lines: after, style: style).string.string)
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

    /// Runs the main loop until the condition holds, for at most five
    /// seconds: AppKit may finish laying the text out on a later turn.
    private func settles(_ condition: () -> Bool) -> Bool {

        let deadline = Date.now.addingTimeInterval(5)
        while !condition() {
            guard Date.now < deadline else { return false }
            RunLoop.main.run(until: .now.addingTimeInterval(0.01))
        }
        return true
    }

    private func isAtBottom(_ scroll: NSScrollView) -> Bool {

        guard let document = scroll.documentView else { return false }
        return scroll.contentView.documentVisibleRect.maxY >= document.bounds.height - 1
    }
}

/// A text storage that records every range it is asked to style.
private final class RecordingStorage: NSTextStorage {

    private let backing: NSMutableAttributedString
    private(set) var styled: [NSRange] = []

    init(_ string: NSAttributedString) {
        backing = NSMutableAttributedString(attributedString: string)
        super.init()
    }

    required init?(coder: NSCoder) { fatalError() }
    required init?(pasteboardPropertyList propertyList: Any, ofType type: NSPasteboard.PasteboardType) { fatalError() }

    override var string: String { backing.string }

    override func attributes(at location: Int, effectiveRange range: NSRangePointer?) -> [NSAttributedString.Key: Any] {
        backing.attributes(at: location, effectiveRange: range)
    }

    override func replaceCharacters(in range: NSRange, with str: String) {
        backing.replaceCharacters(in: range, with: str)
        edited(.editedCharacters, range: range, changeInLength: (str as NSString).length - range.length)
    }

    override func setAttributes(_ attrs: [NSAttributedString.Key: Any]?, range: NSRange) {
        styled.append(range)
        backing.setAttributes(attrs, range: range)
        edited(.editedAttributes, range: range, changeInLength: 0)
    }
}
