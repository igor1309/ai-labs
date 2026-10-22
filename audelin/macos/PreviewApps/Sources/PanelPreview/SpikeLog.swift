import AppKit
import GlassLedger
import PanelUI
import SwiftUI

/// Spike: the whole log as one read-only `NSTextView`, so a selection can
/// span entries and the app learns what was selected.
///
/// Questions it answers: can AppKit draw the design's entry (gutter, dim
/// pending text, caret); does a selection survive text settling
/// and lines arriving; can the log follow the newest line until the reader
/// scrolls up.
struct SpikeLog: NSViewRepresentable {

    let lines: PanelState.Lines
    let followsLive: Bool
    let tokens: GlassLedger
    let lineHeight: CGFloat
    let gutterWidth: CGFloat
    /// A selection the reader finished making, on mouse-up.
    let hold: (PanelState.Held) -> Void
    let scrolled: (_ atBottom: Bool) -> Void

    func makeCoordinator() -> Coordinator { Coordinator(self) }

    func makeNSView(context: Context) -> NSScrollView {

        let scroll = NSScrollView()
        scroll.drawsBackground = false
        scroll.hasVerticalScroller = true
        scroll.autohidesScrollers = true

        let text = LogTextView(usingTextLayoutManager: true)
        text.isVerticallyResizable = true
        text.isHorizontallyResizable = false
        text.autoresizingMask = [.width]
        text.maxSize = NSSize(width: CGFloat.greatestFiniteMagnitude, height: .greatestFiniteMagnitude)
        text.textContainer?.widthTracksTextView = true
        scroll.documentView = text

        text.isEditable = false
        text.isSelectable = true
        text.drawsBackground = false
        text.textContainerInset = NSSize(width: tokens.space16, height: tokens.space12)
        text.textContainer?.lineFragmentPadding = 0
        text.selectionStarted = { [weak coordinator = context.coordinator] in coordinator?.isSelecting = true }
        text.selectionEnded = { [weak coordinator = context.coordinator, weak text] in
            guard let coordinator, let text else { return }
            coordinator.finishSelecting(text)
        }

        scroll.contentView.postsBoundsChangedNotifications = true
        NotificationCenter.default.addObserver(
            context.coordinator,
            selector: #selector(Coordinator.boundsChanged(_:)),
            name: NSView.boundsDidChangeNotification,
            object: scroll.contentView
        )
        context.coordinator.scroll = scroll

        return scroll
    }

    func updateNSView(_ scroll: NSScrollView, context: Context) {

        let coordinator = context.coordinator
        coordinator.parent = self

        let text = scroll.documentView as! NSTextView
        text.selectedTextAttributes = [
            .backgroundColor: NSColor(tokens.selBg),
            .foregroundColor: NSColor(tokens.selText),
        ]

        let transcript = Transcript(lines: lines, style: style)
        coordinator.entries = transcript.entries
        coordinator.isUpdating = true
        // AppKit moves the selection to the end on any storage edit, even one
        // below it; the edit keeps the text above in place, so put it back.
        let selection = text.selectedRange()
        apply(transcript.string, to: text.textStorage!)
        let length = text.textStorage!.length
        text.setSelectedRange(NSIntersectionRange(selection, NSRange(location: 0, length: length)))
        coordinator.isUpdating = false

        if followsLive, !coordinator.isSelecting { text.scrollToEndOfDocument(nil) }
    }
}

// MARK: - Updating in place

private extension SpikeLog {

    /// Replaces only what changed after the common prefix, and restyles the
    /// prefix in place: characters above the change keep their position, so
    /// the reader's selection and scroll position stay.
    func apply(_ new: NSAttributedString, to storage: NSTextStorage) {

        let old = storage.string as NSString
        let next = new.string as NSString
        var prefix = 0
        let limit = min(old.length, next.length)
        while prefix < limit, old.character(at: prefix) == next.character(at: prefix) { prefix += 1 }

        storage.beginEditing()
        storage.replaceCharacters(
            in: NSRange(location: prefix, length: old.length - prefix),
            with: new.attributedSubstring(from: NSRange(location: prefix, length: next.length - prefix))
        )
        new.enumerateAttributes(in: NSRange(location: 0, length: prefix)) { attributes, range, _ in
            storage.setAttributes(attributes, range: range)
        }
        storage.endEditing()
    }

    var style: Transcript.Style {

        .init(tokens: tokens, lineHeight: lineHeight, gutterWidth: gutterWidth)
    }
}

// MARK: - Coordinator

extension SpikeLog {

    @MainActor
    final class Coordinator: NSObject {

        var parent: SpikeLog
        var entries: [Transcript.EntryRange] = []
        var isUpdating = false
        weak var scroll: NSScrollView?
        /// A drag is selecting text: the log holds still under it.
        var isSelecting = false
        private var atBottom = true

        init(_ parent: SpikeLog) { self.parent = parent }

        /// A drag ended: what it selected is held, and the selection fades
        /// from the log, which draws held text like any other. A click that
        /// only clears the selection lets nothing go; the held list's own
        /// button does.
        func finishSelecting(_ text: LogTextView) {

            isSelecting = false

            let range = text.selectedRange()
            guard let storage = text.textStorage,
                  let held = Transcript.held(in: range, of: storage, entries: entries)
            else { return }

            text.fadeSelection(range)
            text.setSelectedRange(NSRange(location: range.location, length: 0))
            parent.hold(held)
        }

        @objc func boundsChanged(_ notification: Notification) {

            guard let scroll, let document = scroll.documentView else { return }

            let visible = scroll.contentView.documentVisibleRect
            let now = visible.maxY >= document.bounds.height - 4
            guard now != atBottom else { return }

            atBottom = now
            parent.scrolled(now)
        }
    }
}

/// Reports a mouse selection once it is made: `mouseDown` runs AppKit's own
/// tracking loop and returns only after the button is released, so neither
/// the delegate nor an app event monitor sees the end of the drag.
final class LogTextView: NSTextView {

    var selectionStarted: (() -> Void)?
    var selectionEnded: (() -> Void)?

    override func mouseDown(with event: NSEvent) {

        selectionStarted?()
        super.mouseDown(with: event)
        selectionEnded?()
    }

    /// How long a held selection takes to fade (owner, 2026-10-22).
    static let fade: TimeInterval = 0.3

    /// Lays a picture of the selected lines over them and fades it out, so
    /// the selection dissolves into the text below once that is unselected.
    func fadeSelection(_ range: NSRange) {

        guard let layout = textLayoutManager,
              let content = layout.textContentManager,
              let start = content.location(content.documentRange.location, offsetBy: range.location),
              let end = content.location(start, offsetBy: range.length),
              let textRange = NSTextRange(location: start, end: end)
        else { return }

        var bounds = NSRect.null
        layout.enumerateTextSegments(in: textRange, type: .selection, options: []) { _, frame, _, _ in
            bounds = bounds.union(frame)
            return true
        }
        let origin = textContainerOrigin
        let rect = bounds.offsetBy(dx: origin.x, dy: origin.y).integral
        guard !rect.isEmpty, let picture = bitmapImageRepForCachingDisplay(in: rect) else { return }
        cacheDisplay(in: rect, to: picture)

        let image = NSImage(size: rect.size)
        image.addRepresentation(picture)
        let overlay = NSImageView(frame: rect)
        overlay.image = image
        overlay.imageScaling = .scaleNone
        addSubview(overlay)

        NSAnimationContext.runAnimationGroup { context in
            context.duration = Self.fade
            overlay.animator().alphaValue = 0
        }
        // Removed on a timer: an animation's completion never comes in a
        // window that is not on screen.
        DispatchQueue.main.asyncAfter(deadline: .now() + Self.fade) {
            overlay.removeFromSuperview()
        }
    }
}

// MARK: - The transcript as attributed text

/// One paragraph per entry: time and speaker in a gutter, then the text with a
/// hanging indent, so wrapped lines sit under the text, not the gutter.
@MainActor
struct Transcript {

    struct Style {

        let tokens: GlassLedger
        let lineHeight: CGFloat
        let gutterWidth: CGFloat
    }

    struct EntryRange: Equatable {

        let id: PanelState.Entry.ID
        /// The entry's text, without its gutter.
        let body: NSRange
    }

    /// Marks the gutter, so it is left out of a selection's text.
    static let gutter = NSAttributedString.Key("audelin.gutter")

    let string: NSAttributedString
    let entries: [EntryRange]

    init(lines: PanelState.Lines, style: Style) {

        let builder = Builder(style: style)

        if let late = lines.late {

            builder.caption("дописано позже · \(late.span)")
            late.entries.forEach { builder.entry($0, alpha: 0.6) }
        }

        lines.entries.forEach { builder.entry($0, alpha: 1) }

        string = builder.result
        entries = builder.ranges
    }

    /// The selection as the panel holds it: the text without gutters, and
    /// the first entry it touches.
    static func held(
        in range: NSRange,
        of string: NSAttributedString,
        entries: [EntryRange]
    ) -> PanelState.Held? {

        let selected = text(in: range, of: string)
        let first = entries.first { NSIntersectionRange($0.body, range).length > 0 }
        guard let first, !selected.isEmpty else { return nil }

        return .init(entryID: first.id, text: selected)
    }

    /// The selected text as the reader sees it, without gutters.
    static func text(in range: NSRange, of string: NSAttributedString) -> String {

        var parts = ""
        string.enumerateAttribute(gutter, in: range) { value, run, _ in
            if value == nil { parts += string.attributedSubstring(from: run).string }
        }
        return parts.trimmingCharacters(in: .whitespacesAndNewlines)
    }
}

private extension Transcript {

    @MainActor
    final class Builder {

        let style: Style
        let result = NSMutableAttributedString()
        var ranges: [EntryRange] = []

        private var tokens: GlassLedger { style.tokens }

        init(style: Style) {

            self.style = style
        }

        func caption(_ string: String) {

            newParagraph()
            result.append(.init(string: string, attributes: [
                .font: font(tokens.typeCaption),
                .baselineOffset: lift(tokens.typeCaption),
                .foregroundColor: NSColor(tokens.gutter),
                .paragraphStyle: paragraph(size: tokens.typeCaption, indent: 0),
                Transcript.gutter: true,
            ]))
        }

        func entry(_ entry: PanelState.Entry, alpha: CGFloat) {

            newParagraph()

            let size = tokens.typeBody
            let paragraph = paragraph(size: size, indent: style.gutterWidth + tokens.space12)
            func attributes(_ font: NSFont, _ color: Color) -> [NSAttributedString.Key: Any] {
                [
                    .font: font,
                    .foregroundColor: NSColor(color).withAlphaComponent(alpha),
                    .paragraphStyle: paragraph,
                    .baselineOffset: lift(size),
                ]
            }

            var gutter = attributes(font(size), tokens.gutter)
            gutter[Transcript.gutter] = true
            var speaker = attributes(font(size, .semibold), entry.speaker == .me ? tokens.me : tokens.them)
            speaker[Transcript.gutter] = true

            result.append(.init(string: entry.time + "\t", attributes: gutter))
            result.append(.init(string: entry.speaker == .me ? "я" : "они", attributes: speaker))
            result.append(.init(string: "\t", attributes: gutter))

            let start = result.length
            result.append(.init(string: entry.settled, attributes: attributes(font(size), tokens.text)))

            if !entry.pending.isEmpty {

                // The design starts pending text on its own line, in the same
                // paragraph so it keeps the hanging indent.
                let pending = (entry.settled.isEmpty ? "" : "\u{2028}") + entry.pending
                result.append(.init(string: pending, attributes: attributes(font(size), tokens.gutter)))
                result.addAttribute(.kern, value: tokens.space2, range: NSRange(location: result.length - 1, length: 1))
                result.append(caret(paragraph))
            }

            let body = NSRange(location: start, length: result.length - start)
            ranges.append(.init(id: entry.id, body: body))
        }

        private func caret(_ paragraph: NSParagraphStyle) -> NSAttributedString {

            let color = NSColor(tokens.me)
            let image = NSImage(size: NSSize(width: 2, height: 15), flipped: false) { rect in
                color.setFill()
                rect.fill()
                return true
            }
            let attachment = NSTextAttachment()
            attachment.image = image
            attachment.bounds = CGRect(x: 0, y: -3, width: 2, height: 15)

            let caret = NSMutableAttributedString(attachment: attachment)
            caret.addAttribute(.paragraphStyle, value: paragraph, range: NSRange(location: 0, length: caret.length))
            return caret
        }

        private func newParagraph() {

            guard result.length > 0 else { return }
            result.append(.init(string: "\n", attributes: [.paragraphStyle: paragraph(size: tokens.typeBody, indent: 0)]))
        }

        private func font(_ size: CGFloat, _ weight: NSFont.Weight = .regular) -> NSFont {

            let descriptor = NSFontDescriptor(fontAttributes: [.family: tokens.fontData])
                .addingAttributes([.traits: [NSFontDescriptor.TraitKey.weight: weight]])
            return NSFont(descriptor: descriptor, size: size) ?? .monospacedSystemFont(ofSize: size, weight: weight)
        }

        /// Fixed-height lines put their extra space above the glyphs; lifting
        /// them by half of it splits the space above and below.
        private func lift(_ size: CGFloat) -> CGFloat {

            tokens.leading(tokens.fontData, size, style.lineHeight) / 2
        }

        /// The design's line height, with the extra space split above and
        /// below the glyphs as the SwiftUI log does.
        private func paragraph(size: CGFloat, indent: CGFloat) -> NSParagraphStyle {

            let style = NSMutableParagraphStyle()
            let height = (size * self.style.lineHeight).rounded()
            style.minimumLineHeight = height
            style.maximumLineHeight = height
            style.paragraphSpacing = tokens.space12
            style.headIndent = indent

            let time = NSAttributedString(string: "00:00", attributes: [.font: font(size)]).size().width
            style.tabStops = [
                NSTextTab(textAlignment: .left, location: time + tokens.space8),
                NSTextTab(textAlignment: .left, location: indent),
            ]
            return style
        }
    }
}

