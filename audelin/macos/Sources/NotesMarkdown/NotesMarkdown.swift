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
        /// Time references such as `[02:45]`.
        public let tertiary: NSColor
        public let codeBackground: NSColor
        public let rule: NSColor
        /// The rhythm the text is set in.
        public let layout: NotesLayout

        public init(body: NSFont, headings: [NSFont], code: NSFont, text: NSColor, secondary: NSColor, tertiary: NSColor,
                    codeBackground: NSColor, rule: NSColor, layout: NotesLayout = .init()) {
            self.body = body; self.headings = headings; self.code = code; self.text = text
            self.secondary = secondary; self.tertiary = tertiary; self.codeBackground = codeBackground; self.rule = rule; self.layout = layout
        }
    }

    public static func render(_ markdown: String, style: Style) -> NSAttributedString {
        let renderer = Renderer(style: style)
        let lines = renderer.blocks(Document(parsing: markdown, options: [.disableSmartOpts]), depth: 0)
        let text = NSMutableAttributedString()
        for (index, var line) in lines.enumerated() {
            // A heading straight under a section label already has the label's space.
            if index > 0, lines[index - 1].isLabel, line.isHeading {
                let paragraph = line.paragraph.mutableCopy() as! NSMutableParagraphStyle
                paragraph.paragraphSpacingBefore = 0
                line.paragraph = paragraph
            }
            line.text.addAttribute(.paragraphStyle, value: line.paragraph, range: NSRange(location: 0, length: line.text.length))
            text.append(line.text)
            // An empty paragraph, such as an empty table cell, is only its newline.
            guard index < lines.count - 1 || line.text.length == 0 else { continue }
            // A paragraph's newline belongs to it and carries its paragraph style.
            var ending = line.text.length > 0 ? line.text.attributes(at: line.text.length - 1, effectiveRange: nil)
                : [.font: style.body, .foregroundColor: style.text]
            ending[.backgroundColor] = nil
            ending[.paragraphStyle] = line.paragraph
            text.append(NSAttributedString(string: "\n", attributes: ending))
        }
        return text
    }
}

/// Line height, spacing and section labels: how open the notes read.
public struct NotesLayout: Equatable, Sendable {
    /// The height of a line of body text; nil keeps the font's own.
    public let lineHeight: CGFloat?
    /// Space after each paragraph and list item.
    public let paragraphSpacing: CGFloat
    /// Space before and after a heading, by level; the last entry serves deeper levels.
    /// Without entries a heading takes 0.6 of its size before it.
    public let headingSpacing: [(before: CGFloat, after: CGFloat)]
    /// Heading levels set as section labels: upper case, tracked, in the secondary colour.
    public let labelLevels: Set<Int>
    /// The tracking of a section label.
    public let labelKern: CGFloat

    public init(lineHeight: CGFloat? = nil, paragraphSpacing: CGFloat = 4,
                headingSpacing: [(before: CGFloat, after: CGFloat)] = [], labelLevels: Set<Int> = [], labelKern: CGFloat = 0) {
        self.lineHeight = lineHeight; self.paragraphSpacing = paragraphSpacing; self.headingSpacing = headingSpacing
        self.labelLevels = labelLevels; self.labelKern = labelKern
    }

    public static func == (a: Self, b: Self) -> Bool {
        a.lineHeight == b.lineHeight && a.paragraphSpacing == b.paragraphSpacing && a.labelLevels == b.labelLevels
            && a.labelKern == b.labelKern && a.headingSpacing.map(\.before) == b.headingSpacing.map(\.before)
            && a.headingSpacing.map(\.after) == b.headingSpacing.map(\.after)
    }
}

/// One output paragraph: its text and the paragraph style the caller applies
/// to it and to its newline.
private struct Line {
    let text: NSMutableAttributedString
    var paragraph: NSParagraphStyle
    var isHeading = false
    var isLabel = false
}

/// One paragraph per output line; the caller joins them with newlines.
private struct Renderer {
    let style: Style
    typealias Style = NotesMarkdown.Style
    private let indent: CGFloat = 20

    func blocks(_ markup: Markup, depth: Int) -> [Line] {
        switch markup {
        case let heading as Heading:
            let font = style.headings[min(heading.level, style.headings.count) - 1]
            let layout = style.layout
            let spacing = layout.headingSpacing.isEmpty ? nil : layout.headingSpacing[min(heading.level, layout.headingSpacing.count) - 1]
            let text = inline(heading, font: font)
            let isLabel = layout.labelLevels.contains(heading.level)
            if isLabel {
                let upper = NSMutableAttributedString()
                text.enumerateAttributes(in: NSRange(location: 0, length: text.length)) { attributes, range, _ in
                    upper.append(NSAttributedString(string: text.attributedSubstring(from: range).string.uppercased(), attributes: attributes))
                }
                let all = NSRange(location: 0, length: upper.length)
                upper.addAttribute(.foregroundColor, value: style.secondary, range: all)
                upper.addAttribute(.kern, value: layout.labelKern, range: all)
                text.setAttributedString(upper)
            }
            var heading = line(text, paragraph(depth: depth, body: false) {
                $0.paragraphSpacingBefore = spacing?.before ?? font.pointSize * 0.6
                if let after = spacing?.after { $0.paragraphSpacing = after }
            })
            heading.isHeading = true
            heading.isLabel = isLabel
            return [heading]
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
                line.text.addAttribute(.foregroundColor, value: style.secondary, range: NSRange(location: 0, length: line.text.length))
                return line
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
    private func items(_ items: [ListItem], depth: Int, marker: (Int) -> String) -> [Line] {
        items.enumerated().flatMap { index, item in
            item.children.enumerated().flatMap { position, child -> [Line] in
                if child is UnorderedList || child is OrderedList { return blocks(child, depth: depth + 1) }
                return blocks(child, depth: depth + 1).enumerated().map { offset, line in
                    let first = position == 0 && offset == 0
                    if first {
                        line.text.insert(NSAttributedString(string: marker(index) + "\t", attributes: [
                            .font: self.style.body, .foregroundColor: self.style.secondary,
                        ]), at: 0)
                    }
                    // Only the item's indent and marker change; a table cell keeps its block.
                    let indented = line.paragraph.mutableCopy() as! NSMutableParagraphStyle
                    let depthStyle = paragraph(depth: depth + 1)
                    indented.headIndent = depthStyle.headIndent
                    indented.firstLineHeadIndent = first ? CGFloat(depth) * indent : depthStyle.firstLineHeadIndent
                    indented.tabStops = depthStyle.tabStops
                    var marked = line
                    marked.paragraph = indented
                    return marked
                }
            }
        }
    }

    /// Head and body cells in reading order, each its own block of one text table.
    private func cells(_ table: Markdown.Table) -> [Line] {
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

    private func paragraph(depth: Int, body: Bool = true,
                           _ change: (NSMutableParagraphStyle) -> Void = { _ in }) -> NSParagraphStyle {
        let paragraph = NSMutableParagraphStyle()
        if body, let height = style.layout.lineHeight { paragraph.minimumLineHeight = height; paragraph.maximumLineHeight = height }
        paragraph.firstLineHeadIndent = CGFloat(depth) * indent
        paragraph.headIndent = CGFloat(depth) * indent
        paragraph.tabStops = [NSTextTab(textAlignment: .left, location: CGFloat(depth) * indent)]
        paragraph.defaultTabInterval = indent
        paragraph.paragraphSpacing = style.layout.paragraphSpacing
        change(paragraph)
        return paragraph
    }

    private func line(_ text: NSMutableAttributedString, _ paragraph: NSParagraphStyle) -> Line {
        Line(text: text, paragraph: paragraph)
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
        markTimes(text)
        return text
    }

    private static let time = try! NSRegularExpression(pattern: #"\[(?:\d{1,2}:)?\d{1,2}:\d{2}\]"#)

    /// Sets time references such as `[02:45]` or `[1:02:45]` in the tertiary colour, outside code.
    private func markTimes(_ text: NSMutableAttributedString) {
        for match in Self.time.matches(in: text.string, range: NSRange(location: 0, length: text.length))
        where text.attribute(.font, at: match.range.location, effectiveRange: nil) as? NSFont != style.code {
            text.addAttribute(.foregroundColor, value: style.tertiary, range: match.range)
        }
    }
}
