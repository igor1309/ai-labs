import AppKit
import Markdown

/// Turns a call's Markdown notes into attributed text for a read-only text
/// view: headings, emphasis, lists, code and tables.
public enum NotesMarkdown {

    /// The fonts and colours the text is drawn with; the caller takes them
    /// from its design tokens.
    public struct Style {
        public let body: NSFont
        public let headings: [NSFont]
        public let code: NSFont
        public let text: NSColor
        public let secondary: NSColor
        public let codeBackground: NSColor
        public let rule: NSColor

        public init(body: NSFont, headings: [NSFont], code: NSFont, text: NSColor, secondary: NSColor,
                    codeBackground: NSColor, rule: NSColor) {
            self.body = body; self.headings = headings; self.code = code; self.text = text
            self.secondary = secondary; self.codeBackground = codeBackground; self.rule = rule
        }
    }

    public static func render(_ markdown: String, style: Style) -> NSAttributedString {
        let renderer = Renderer(style: style)
        let lines = renderer.blocks(Document(parsing: markdown, options: [.disableSmartOpts]), depth: 0)
        let text = NSMutableAttributedString()
        for (index, line) in lines.enumerated() {
            text.append(line)
            guard index < lines.count - 1, line.length > 0 else { continue }
            // A paragraph's newline belongs to it and carries its paragraph style.
            var ending = line.attributes(at: line.length - 1, effectiveRange: nil)
            ending[.backgroundColor] = nil
            text.append(NSAttributedString(string: "\n", attributes: ending))
        }
        return text
    }
}

/// One paragraph per output line; the caller joins them with newlines.
private struct Renderer {
    let style: Style
    typealias Style = NotesMarkdown.Style
    private let indent: CGFloat = 20

    func blocks(_ markup: Markup, depth: Int) -> [NSAttributedString] {
        switch markup {
        case let heading as Heading:
            let font = style.headings[min(heading.level, style.headings.count) - 1]
            return [line(inline(heading, font: font), paragraph(depth: depth) { $0.paragraphSpacingBefore = font.pointSize * 0.6 })]
        case let paragraph as Paragraph:
            return [line(inline(paragraph, font: style.body), self.paragraph(depth: depth))]
        case let list as UnorderedList:
            return items(Array(list.listItems), depth: depth) { _ in "•" }
        case let list as OrderedList:
            return items(Array(list.listItems), depth: depth) { "\(Int(list.startIndex) + $0)." }
        case let code as CodeBlock:
            let source = code.code.hasSuffix("\n") ? String(code.code.dropLast()) : code.code
            return [line(NSMutableAttributedString(string: source, attributes: [
                .font: style.code, .foregroundColor: style.text, .backgroundColor: style.codeBackground,
            ]), paragraph(depth: depth))]
        case let table as Markdown.Table:
            return cells(table)
        case let quote as BlockQuote:
            return quote.children.flatMap { blocks($0, depth: depth + 1) }.map { line in
                let quoted = NSMutableAttributedString(attributedString: line)
                quoted.addAttribute(.foregroundColor, value: style.secondary, range: NSRange(location: 0, length: quoted.length))
                return quoted
            }
        case is ThematicBreak:
            return [line(NSMutableAttributedString(string: "———", attributes: [.font: style.body, .foregroundColor: style.rule]),
                         paragraph(depth: depth))]
        default:
            return markup.children.flatMap { blocks($0, depth: depth) }
        }
    }

    /// Each item's first line carries its marker before a tab; its own lines
    /// and nested lists sit one indent further in.
    private func items(_ items: [ListItem], depth: Int, marker: (Int) -> String) -> [NSAttributedString] {
        items.enumerated().flatMap { index, item in
            item.children.enumerated().flatMap { position, child -> [NSAttributedString] in
                if child is UnorderedList || child is OrderedList { return blocks(child, depth: depth + 1) }
                return blocks(child, depth: depth + 1).enumerated().map { offset, line in
                    let marked = NSMutableAttributedString(attributedString: line)
                    let first = position == 0 && offset == 0
                    let style = paragraph(depth: depth + 1) { if first { $0.firstLineHeadIndent = CGFloat(depth) * indent } }
                    if first {
                        marked.insert(NSAttributedString(string: marker(index) + "\t", attributes: [
                            .font: self.style.body, .foregroundColor: self.style.secondary,
                        ]), at: 0)
                    }
                    marked.addAttribute(.paragraphStyle, value: style, range: NSRange(location: 0, length: marked.length))
                    return marked
                }
            }
        }
    }

    /// Head and body cells in reading order, each its own block of one text table.
    private func cells(_ table: Markdown.Table) -> [NSAttributedString] {
        let rows = [Array(table.head.cells)] + table.body.rows.map { Array($0.cells) }
        let textTable = NSTextTable()
        textTable.numberOfColumns = max(rows.map(\.count).max() ?? 1, 1)
        textTable.collapsesBorders = true
        let bold = NSFontManager.shared.convert(style.body, toHaveTrait: .boldFontMask)
        return rows.enumerated().flatMap { row, cells in
            cells.enumerated().map { column, cell in
                let block = NSTextTableBlock(table: textTable, startingRow: row, rowSpan: 1, startingColumn: column, columnSpan: 1)
                block.setWidth(0.5, type: .absoluteValueType, for: .border)
                block.setBorderColor(style.rule)
                block.setWidth(6, type: .absoluteValueType, for: .padding)
                return line(inline(cell, font: row == 0 ? bold : style.body), paragraph(depth: 0) { $0.textBlocks = [block] })
            }
        }
    }

    private func paragraph(depth: Int, _ change: (NSMutableParagraphStyle) -> Void = { _ in }) -> NSParagraphStyle {
        let paragraph = NSMutableParagraphStyle()
        paragraph.firstLineHeadIndent = CGFloat(depth) * indent
        paragraph.headIndent = CGFloat(depth) * indent
        paragraph.tabStops = [NSTextTab(textAlignment: .left, location: CGFloat(depth) * indent)]
        paragraph.defaultTabInterval = indent
        paragraph.paragraphSpacing = 4
        change(paragraph)
        return paragraph
    }

    private func line(_ text: NSMutableAttributedString, _ paragraph: NSParagraphStyle) -> NSAttributedString {
        text.addAttribute(.paragraphStyle, value: paragraph, range: NSRange(location: 0, length: text.length))
        return text
    }

    private func inline(_ markup: Markup, font: NSFont) -> NSMutableAttributedString {
        let text = NSMutableAttributedString()
        for child in markup.children {
            switch child {
            case let plain as Markdown.Text:
                text.append(NSAttributedString(string: plain.string, attributes: [.font: font, .foregroundColor: style.text]))
            case is Strong:
                text.append(inline(child, font: NSFontManager.shared.convert(font, toHaveTrait: .boldFontMask)))
            case is Emphasis:
                text.append(inline(child, font: NSFontManager.shared.convert(font, toHaveTrait: .italicFontMask)))
            case let code as InlineCode:
                text.append(NSAttributedString(string: code.code, attributes: [.font: style.code, .foregroundColor: style.text]))
            case let link as Markdown.Link:
                let linked = inline(link, font: font)
                if let destination = link.destination, let url = URL(string: destination) {
                    linked.addAttribute(.link, value: url, range: NSRange(location: 0, length: linked.length))
                }
                text.append(linked)
            case is SoftBreak:
                text.append(NSAttributedString(string: " ", attributes: [.font: font, .foregroundColor: style.text]))
            case is LineBreak:
                text.append(NSAttributedString(string: "\u{2028}", attributes: [.font: font, .foregroundColor: style.text]))
            default:
                text.append(inline(child, font: font))
            }
        }
        return text
    }
}
