import AppKit
import GlassLedger
import SwiftUI

/// The log as one attributed string: each entry a paragraph with its time
/// and speaker in a hanging gutter.
@MainActor
struct Transcript {

    struct Style {

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

        let builder = Builder(style: style)

        let log = style.tokens.space12

        for row in lines.rows {

            switch row {
            case let .entry(entry):
                builder.entry(entry, alpha: 1, spacing: log)

            case let .gap(gap):
                builder.caption("\(gap.speaker == .me ? "я" : "они")  \(gap.text)", alpha: 1, spacing: log)

            case let .late(late):
                // The design dims the whole group, spaces it tighter than the
                // log around it, and rules it off from what follows.
                let group = style.tokens.space8
                builder.caption("дописано позже · \(late.span)", alpha: 0.6, spacing: group)
                for (index, entry) in late.entries.enumerated() {
                    let isLast = index == late.entries.count - 1
                    builder.entry(entry, alpha: 0.6, spacing: isLast ? log + Transcript.ruleWidth + log : group)
                }
                builder.ruleBelow(gap: log)
            }
        }

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
        /// A long log asks for the same few fonts and paragraph styles on
        /// every update; making each anew was most of an update's cost (LAB-759).
        private var fonts: [FontKey: NSFont] = [:]
        private var paragraphs: [ParagraphKey: NSParagraphStyle] = [:]

        private struct FontKey: Hashable { let size: CGFloat; let weight: CGFloat }
        private struct ParagraphKey: Hashable { let size: CGFloat; let indent: CGFloat; let spacing: CGFloat }

        init(style: Style) {

            self.style = style
        }

        func caption(_ string: String, alpha: CGFloat, spacing: CGFloat) {

            newParagraph()
            result.append(.init(string: string, attributes: [
                .font: font(tokens.typeCaption),
                .baselineOffset: lift(tokens.typeCaption),
                .foregroundColor: NSColor(tokens.gutter).withAlphaComponent(alpha),
                .paragraphStyle: paragraph(size: tokens.typeCaption, indent: 0, spacing: spacing),
                Transcript.gutter: true,
            ]))
        }

        func entry(_ entry: PanelState.Entry, alpha: CGFloat, spacing: CGFloat) {

            newParagraph()

            let size = tokens.typeBody
            let paragraph = paragraph(size: size, indent: style.config.gutterWidth + tokens.space12, spacing: spacing)
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

        /// Draws a line under the last paragraph, `gap` below its text.
        func ruleBelow(gap: CGFloat) {

            guard let last = ranges.last else { return }
            result.addAttribute(Transcript.ruleBelow, value: gap, range: last.body)
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
            result.append(.init(string: "\n", attributes: [.paragraphStyle: paragraph(size: tokens.typeBody, indent: 0, spacing: tokens.space12)]))
        }

        private func font(_ size: CGFloat, _ weight: NSFont.Weight = .regular) -> NSFont {

            let key = FontKey(size: size, weight: weight.rawValue)
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
        private func paragraph(size: CGFloat, indent: CGFloat, spacing: CGFloat) -> NSParagraphStyle {

            let key = ParagraphKey(size: size, indent: indent, spacing: spacing)
            if let style = paragraphs[key] { return style }
            let style = NSMutableParagraphStyle()
            let height = (size * self.style.config.lineHeight).rounded()
            style.minimumLineHeight = height
            style.maximumLineHeight = height
            style.paragraphSpacing = spacing
            style.headIndent = indent

            let time = NSAttributedString(string: "00:00", attributes: [.font: font(size)]).size().width
            style.tabStops = [
                NSTextTab(textAlignment: .left, location: time + tokens.space8),
                NSTextTab(textAlignment: .left, location: indent),
            ]
            paragraphs[key] = style
            return style
        }
    }
}
