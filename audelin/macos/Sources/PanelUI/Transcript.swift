import AppKit
import GlassLedger
import SwiftUI

/// The log as one attributed string: each entry a paragraph with its speaker's
/// symbol and its time in a hanging gutter.
@MainActor
struct Transcript {

    struct Style: Equatable {

        let tokens: GlassLedger
        let config: PanelConfig
    }

    struct EntryRange: Equatable {

        let id: PanelState.Entry.ID
        /// The entry's text, without its gutter.
        let body: NSRange
    }

    /// Marks the gutter, so it is left out of a selection's text.
    static let gutter = NSAttributedString.Key("audelin.gutter")
    /// Marks a paragraph with a line under it, at this distance.
    static let ruleBelow = NSAttributedString.Key("audelin.ruleBelow")
    static let ruleWidth: CGFloat = 1

    let string: NSAttributedString
    let entries: [EntryRange]

    init(lines: PanelState.Lines, style: Style) {

        let edit = Rows().update(lines, style: style)
        string = edit.text
        entries = edit.entries
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

extension Transcript {

    /// What changed in the transcript since the last update.
    struct Edit {

        /// The part of the previous transcript to replace.
        let range: NSRange
        let text: NSAttributedString
        /// Every entry's place in the new transcript.
        let entries: [EntryRange]
    }

    /// Keeps each row's text from one update to the next, so an update
    /// builds only the rows from the first that changed.
    @MainActor
    final class Rows {

        private var builder: Builder?
        private var pieces: [Piece] = []
        /// Where each piece ends in the transcript.
        private var ends: [Int] = []
        /// How many entries the pieces up to and including each one hold.
        private var entryEnds: [Int] = []
        private var entries: [EntryRange] = []
        /// The sealed rows of the last update: unchanged ones share its storage and compare at once.
        private var sealed: [PanelState.Row] = []

        /// The transcript's length after the last update.
        var length: Int { ends.last ?? 0 }

        func update(_ lines: PanelState.Lines, style: Style) -> Edit {

            if builder?.style != style {
                builder = Builder(style: style)
                pieces = []
                ends = []
                entryEnds = []
                entries = []
                sealed = []
            }
            let builder = builder!

            let rows = lines.rows
            // Walking a long call's rows on every update would grow with the call.
            var first = sealed == rows.sealed ? sealed.count : 0
            sealed = rows.sealed
            while first < min(pieces.count, rows.count), pieces[first].row == rows[first] { first += 1 }

            let start = first == 0 ? 0 : ends[first - 1]
            let range = NSRange(location: start, length: length - start)
            entries.removeLast(entries.count - (first == 0 ? 0 : entryEnds[first - 1]))
            pieces.removeLast(pieces.count - first)
            ends.removeLast(ends.count - first)
            entryEnds.removeLast(entryEnds.count - first)

            let text = NSMutableAttributedString()
            for row in rows[first...] {
                if let last = pieces.last {
                    text.append(.init(string: "\n", attributes: [.paragraphStyle: last.paragraph]))
                }
                let piece = builder.piece(row)
                let offset = start + text.length
                entries += piece.entries.map { .init(id: $0.id, body: NSRange(location: $0.body.location + offset, length: $0.body.length)) }
                text.append(piece.text)
                pieces.append(piece)
                ends.append(start + text.length)
                entryEnds.append(entries.count)
            }

            return Edit(range: range, text: text, entries: entries)
        }
    }

    /// One row's text, with its entries placed from its own start.
    struct Piece {

        let row: PanelState.Row
        let text: NSAttributedString
        let entries: [EntryRange]
        /// The style of its last paragraph, which the newline after it takes.
        let paragraph: NSParagraphStyle
    }
}

private extension Transcript {

    @MainActor
    final class Builder {

        let style: Style
        private var result = NSMutableAttributedString()
        private var ranges: [EntryRange] = []

        private var tokens: GlassLedger { style.tokens }

        private static let symbolSize: CGFloat = 11
        /// Wide enough for either speaker's symbol, so the times line up.
        private static let symbolSlot: CGFloat = 16

        // Built once a style: every row shares the same few.
        private var fonts: [FontKey: NSFont] = [:]
        private var paragraphs: [ParagraphKey: NSParagraphStyle] = [:]
        private var timeWidths: [CGFloat: CGFloat] = [:]
        private var caretImage: NSImage?
        private var symbols: [SymbolKey: NSTextAttachment] = [:]
        /// The style of the paragraph being built, which the text system
        /// gives its ending newline too.
        private var current: NSParagraphStyle?

        init(style: Style) {

            self.style = style
        }

        func piece(_ row: PanelState.Row) -> Piece {

            result = NSMutableAttributedString()
            ranges = []
            current = nil

            let log = tokens.space12
            switch row {
            case let .entry(entry):
                self.entry(entry, alpha: 1, spacing: log)

            case let .gap(gap):
                caption("\(gap.speaker == .me ? "я" : "они")  \(gap.text)", alpha: 1, spacing: log)

            case let .late(late):
                // The design dims the whole group, spaces it tighter than the
                // log around it, and rules it off from what follows.
                let group = tokens.space8
                caption("дописано позже · \(late.span)", alpha: 0.6, spacing: group)
                for (index, entry) in late.entries.enumerated() {
                    let isLast = index == late.entries.count - 1
                    self.entry(entry, alpha: 0.6, spacing: isLast ? log + Transcript.ruleWidth + log : group)
                }
                ruleBelow(gap: log)
            }

            return Piece(row: row, text: result, entries: ranges, paragraph: current!)
        }

        private func caption(_ string: String, alpha: CGFloat, spacing: CGFloat) {

            newParagraph()
            let paragraph = paragraph(size: tokens.typeCaption, indent: 0, timeAt: nil, spacing: spacing)
            current = paragraph
            result.append(.init(string: string, attributes: [
                .font: font(tokens.typeCaption),
                .baselineOffset: lift(tokens.typeCaption),
                .foregroundColor: NSColor(tokens.gutter).withAlphaComponent(alpha),
                .paragraphStyle: paragraph,
                Transcript.gutter: true,
            ]))
        }

        private func entry(_ entry: PanelState.Entry, alpha: CGFloat, spacing: CGFloat) {

            newParagraph()

            let size = tokens.typeBody
            let paragraph = paragraph(
                size: size,
                indent: Self.symbolSlot + tokens.space4 + timeWidth(size) + tokens.space12,
                timeAt: Self.symbolSlot + tokens.space4,
                spacing: spacing
            )
            current = paragraph
            func attributes(_ font: NSFont, _ color: Color) -> [NSAttributedString.Key: Any] {
                [
                    .font: font,
                    .foregroundColor: NSColor(color).withAlphaComponent(alpha),
                    .paragraphStyle: paragraph,
                    .baselineOffset: lift(size),
                ]
            }

            // The speaker's symbol and the time, both in the speaker's colour,
            // mark who spoke.
            var time = attributes(font(size), entry.speaker == .me ? tokens.me : tokens.them)
            time[Transcript.gutter] = true

            let symbol = NSMutableAttributedString(attachment: symbol(entry.speaker, alpha: alpha, size: size))
            symbol.addAttributes(time, range: NSRange(location: 0, length: symbol.length))
            result.append(symbol)
            result.append(.init(string: "\t" + entry.time + "\t", attributes: time))

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

        /// Draws a line under the last paragraph, `gap` below its text.
        private func ruleBelow(gap: CGFloat) {

            guard let last = ranges.last else { return }
            result.addAttribute(Transcript.ruleBelow, value: gap, range: last.body)
        }

        /// The speaker's symbol, centred in the gutter's slot and on the
        /// time's capital letters, so it sits on the text's first baseline.
        private func symbol(_ speaker: PanelState.Speaker, alpha: CGFloat, size: CGFloat) -> NSTextAttachment {

            let key = SymbolKey(speaker: speaker, alpha: alpha, size: size)
            if let attachment = symbols[key] { return attachment }

            let name = speaker == .me ? "mic.fill" : "speaker.wave.2"
            let label = speaker == .me ? "я" : "они"
            let color = NSColor(speaker == .me ? tokens.me : tokens.them).withAlphaComponent(alpha)
            let configuration = NSImage.SymbolConfiguration(pointSize: Self.symbolSize, weight: .regular)
                .applying(.init(paletteColors: [color]))
            let glyph = NSImage(systemSymbolName: name, accessibilityDescription: label)?
                .withSymbolConfiguration(configuration) ?? NSImage()
            let slot = NSSize(width: Self.symbolSlot, height: glyph.size.height)
            let image = NSImage(size: slot, flipped: false) { rect in
                glyph.draw(in: NSRect(
                    x: (rect.width - glyph.size.width) / 2,
                    y: 0,
                    width: glyph.size.width,
                    height: glyph.size.height
                ))
                return true
            }
            image.accessibilityDescription = label

            let attachment = NSTextAttachment()
            attachment.image = image
            attachment.bounds = CGRect(origin: .init(x: 0, y: (font(size).capHeight - slot.height) / 2), size: slot)
            symbols[key] = attachment
            return attachment
        }

        private func caret(_ paragraph: NSParagraphStyle) -> NSAttributedString {

            let attachment = NSTextAttachment()
            attachment.image = caretImage ?? {
                let color = NSColor(tokens.me)
                let image = NSImage(size: NSSize(width: 2, height: 15), flipped: false) { rect in
                    color.setFill()
                    rect.fill()
                    return true
                }
                caretImage = image
                return image
            }()
            attachment.bounds = CGRect(x: 0, y: -3, width: 2, height: 15)

            let caret = NSMutableAttributedString(attachment: attachment)
            caret.addAttribute(.paragraphStyle, value: paragraph, range: NSRange(location: 0, length: caret.length))
            return caret
        }

        private func newParagraph() {

            guard let current else { return }
            result.append(.init(string: "\n", attributes: [.paragraphStyle: current]))
        }

        private func font(_ size: CGFloat, _ weight: NSFont.Weight = .regular) -> NSFont {

            let key = FontKey(size: size, weight: weight)
            if let font = fonts[key] { return font }

            let descriptor = NSFontDescriptor(fontAttributes: [.family: tokens.fontData])
                .addingAttributes([.traits: [NSFontDescriptor.TraitKey.weight: weight]])
            let font = NSFont(descriptor: descriptor, size: size) ?? .monospacedSystemFont(ofSize: size, weight: weight)
            fonts[key] = font
            return font
        }

        /// Fixed-height lines put their extra space above the glyphs; lifting
        /// them by half of it splits the space above and below.
        private func lift(_ size: CGFloat) -> CGFloat {

            tokens.leading(tokens.fontData, size, style.config.lineHeight) / 2
        }

        /// The design's line height, with the extra space split above and
        /// below the glyphs as the SwiftUI log does.
        private func paragraph(size: CGFloat, indent: CGFloat, timeAt: CGFloat?, spacing: CGFloat) -> NSParagraphStyle {

            let key = ParagraphKey(size: size, indent: indent, timeAt: timeAt, spacing: spacing)
            if let style = paragraphs[key] { return style }

            let style = NSMutableParagraphStyle()
            let height = (size * self.style.config.lineHeight).rounded()
            style.minimumLineHeight = height
            style.maximumLineHeight = height
            style.paragraphSpacing = spacing
            style.headIndent = indent
            // Keep wrapped text and the live caret clear of overlay scrollbars.
            style.tailIndent = -tokens.space24

            style.tabStops = ([timeAt, indent] as [CGFloat?]).compactMap { $0 }.map { NSTextTab(textAlignment: .left, location: $0) }
            paragraphs[key] = style
            return style
        }

        /// How wide the gutter's time is, up to a call of 999 minutes, so the
        /// text starts at the same place on every line.
        private func timeWidth(_ size: CGFloat) -> CGFloat {

            if let width = timeWidths[size] { return width }
            let width = NSAttributedString(string: "000:00", attributes: [.font: font(size)]).size().width.rounded(.up)
            timeWidths[size] = width
            return width
        }
    }

    struct FontKey: Hashable {

        let size: CGFloat
        let weight: NSFont.Weight
    }

    struct ParagraphKey: Hashable {

        let size: CGFloat
        let indent: CGFloat
        let timeAt: CGFloat?
        let spacing: CGFloat
    }

    struct SymbolKey: Hashable {

        let speaker: PanelState.Speaker
        let alpha: CGFloat
        let size: CGFloat
    }
}
