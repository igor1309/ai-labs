import AppKit
import NotesMarkdown
import Testing

struct NotesMarkdownTests {

    @Test func headingsUseTheirLevelsFontAndLoseTheirMarks() throws {

        let text = render("# Итоги\n\n## Решения\n\nТекст")

        #expect(text.string == "Итоги\nРешения\nТекст")
        #expect(font(text, "Итоги") == style.headings[0])
        #expect(font(text, "Решения") == style.headings[1])
        #expect(font(text, "Текст") == style.body)
    }

    @Test func emphasisAndInlineCodeKeepTheirText() throws {

        let text = render("Это **важно**, *очень* и `код`.")

        #expect(text.string == "Это важно, очень и код.")
        #expect(font(text, "важно").map { NSFontManager.shared.traits(of: $0).contains(.boldFontMask) } == true)
        #expect(font(text, "очень").map { NSFontManager.shared.traits(of: $0).contains(.italicFontMask) } == true)
        #expect(font(text, "код") == style.code)
    }

    @Test func listsAreMarkedAndNestedListsIndentFurther() throws {

        let text = render("- Один\n  - Вложенный\n- Два\n\n1. Первый\n2. Второй")

        #expect(text.string == "•\tОдин\n•\tВложенный\n•\tДва\n1.\tПервый\n2.\tВторой")
        let outer = try #require(paragraph(text, "Один")), inner = try #require(paragraph(text, "Вложенный"))
        #expect(inner.headIndent > outer.headIndent)
        #expect(paragraph(text, "Первый")?.headIndent == outer.headIndent)
    }

    @Test func fencedCodeIsMonospacedOnItsBackground() throws {

        let text = render("```\nlet x = 1\n```")

        #expect(text.string == "let x = 1")
        #expect(font(text, "let x = 1") == style.code)
        #expect(attribute(.backgroundColor, text, "let x = 1") as? NSColor == style.codeBackground)
    }

    @Test func tablesBecomeTextTableCellsInReadingOrder() throws {

        let text = render("| Кто | Что |\n|---|---|\n| Аня | План |")

        #expect(text.string == "Кто\nЧто\nАня\nПлан")
        let cells = ["Кто", "Что", "Аня", "План"].compactMap { paragraph(text, $0)?.textBlocks.first as? NSTextTableBlock }
        #expect(cells.count == 4)
        #expect(cells.map(\.startingRow) == [0, 0, 1, 1])
        #expect(cells.map(\.startingColumn) == [0, 1, 0, 1])
        #expect(Set(cells.map { ObjectIdentifier($0.table) }).count == 1)
        #expect(cells.first?.table.numberOfColumns == 2)
        #expect(font(text, "Кто").map { NSFontManager.shared.traits(of: $0).contains(.boldFontMask) } == true)
    }

    @Test func emptyCellsKeepTheirPlaceInTheTable() throws {

        let text = render("| A | B |\n|---|---|\n|   | x |\n| y |   |")

        let cells = blocks(text)
        #expect(cells.map(\.startingRow) == [0, 0, 1, 1, 2, 2])
        #expect(cells.map(\.startingColumn) == [0, 1, 0, 1, 0, 1])
    }

    @Test func aTableInAListItemStaysATable() throws {

        let text = render("- Решения\n\n  | Кто | Что |\n  | --- | --- |\n  | Аня | План |")

        let cells = blocks(text)
        #expect(cells.map(\.startingRow) == [0, 0, 1, 1])
        #expect(cells.map(\.startingColumn) == [0, 1, 0, 1])
        #expect(font(text, "Кто").map { NSFontManager.shared.traits(of: $0).contains(.boldFontMask) } == true)
    }

    // MARK: - Helpers

    /// Each paragraph's table cell, in order, read from the paragraphs themselves.
    private func blocks(_ text: NSAttributedString) -> [NSTextTableBlock] {
        var found: [NSTextTableBlock] = []
        var location = 0
        let string = text.string as NSString
        while location < string.length {
            let range = string.paragraphRange(for: NSRange(location: location, length: 0))
            if let style = text.attribute(.paragraphStyle, at: range.location, effectiveRange: nil) as? NSParagraphStyle,
               let block = style.textBlocks.first as? NSTextTableBlock { found.append(block) }
            location = NSMaxRange(range)
        }
        return found
    }

    private let style = NotesMarkdown.Style(
        body: .systemFont(ofSize: 13), headings: [.systemFont(ofSize: 20, weight: .semibold), .systemFont(ofSize: 16, weight: .semibold), .systemFont(ofSize: 14, weight: .semibold)],
        code: .monospacedSystemFont(ofSize: 12, weight: .regular), text: .black, secondary: .gray,
        codeBackground: .lightGray, rule: .separatorColor
    )

    private func render(_ markdown: String) -> NSAttributedString { NotesMarkdown.render(markdown, style: style) }

    private func attribute(_ key: NSAttributedString.Key, _ text: NSAttributedString, _ part: String) -> Any? {
        let range = (text.string as NSString).range(of: part)
        guard range.location != NSNotFound else { return nil }
        return text.attribute(key, at: range.location, effectiveRange: nil)
    }

    private func font(_ text: NSAttributedString, _ part: String) -> NSFont? { attribute(.font, text, part) as? NSFont }

    private func paragraph(_ text: NSAttributedString, _ part: String) -> NSParagraphStyle? {
        attribute(.paragraphStyle, text, part) as? NSParagraphStyle
    }
}
