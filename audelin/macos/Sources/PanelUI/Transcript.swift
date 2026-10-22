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
            let paragraph = paragraph(size: size, indent: style.config.gutterWidth + tokens.space12)
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

            tokens.leading(tokens.fontData, size, style.config.lineHeight) / 2
        }

        /// The design's line height, with the extra space split above and
        /// below the glyphs as the SwiftUI log does.
        private func paragraph(size: CGFloat, indent: CGFloat) -> NSParagraphStyle {

            let style = NSMutableParagraphStyle()
            let height = (size * self.style.config.lineHeight).rounded()
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
