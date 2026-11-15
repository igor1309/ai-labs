import Foundation
import NotesGeneration
import Testing

@Suite struct MarkdownValidationTests {
    @Test(arguments: [russianNotes, englishNotes])
    func markdownLanguageFixturesHaveAllRequiredSections(markdown: String) throws {
        let notes = try validate(markdown)
        #expect(notes.contains(markdown == russianNotes ? "## О чём встреча" : "## What this was about"))
        #expect(notes.contains(markdown == russianNotes ? "## Решения" : "## Decisions"))
        #expect(notes.contains(markdown == russianNotes ? "## Задачи" : "## Actions"))
        #expect(notes.contains(markdown == russianNotes ? "Не зафиксировано." : "None recorded."))
    }
    @Test(arguments: [russianNotes, englishNotes])
    func optionalQuestionsArePreservedAndStructuralViolationsFail(markdown: String) throws {
        let russian = markdown == russianNotes
        let optional = russian ? "## Открытые вопросы\n\nКто проверит сборку?\n" : "## Open questions\n\nWho will review the build?\n"
        #expect(try validate(markdown + "\n" + optional) == markdown + "\n" + optional)
        #expect(throws: (any Error).self) { try validate("Here are the notes:\n" + markdown) }
        let sections = markdown.components(separatedBy: "## ").dropFirst().map { "## " + $0 }
        let reordered = [sections[0], sections[2], sections[1], sections[3]].joined()
        #expect(throws: (any Error).self) { try validate(reordered) }
        let mixed = markdown.replacingOccurrences(of: russian ? "## Задачи" : "## Actions", with: russian ? "## Actions" : "## Задачи")
        #expect(throws: (any Error).self) { try validate(mixed) }
    }
    @Test(arguments: ["", "{}", "I cannot comply", "## What this was about\nTopic", englishNotes.replacingOccurrences(of: "None recorded.", with: ""), "```markdown\n" + englishNotes + "```", englishNotes + "\n## Actions\nDuplicate", englishNotes.replacingOccurrences(of: "API review", with: "I cannot comply")])
    func refusalEmptyAndIncompleteNotesFail(markdown: String) {
        #expect(throws: (any Error).self) { try validate(markdown) }
    }
    @Test func nestedMarkdownIsPreservedAndEmptyOptionalSectionFails() throws {
        let nested = englishNotes.replacingOccurrences(of: "- No decision was made", with: "- **API**\n  - Review [00:12]\n\n### Details\nMore detail")
        #expect(try validate(nested) == nested)
        #expect(throws: (any Error).self) { try validate(nested + "\n## Open questions\n") }
    }
    @Test func codeFenceHeadingsAreContentAndHiddenSectionsFail() throws {
        let fenced = englishNotes.replacingOccurrences(of: "API review", with: "API review\n\n```text\n## Example\n``` ")
        #expect(try validate(fenced) == fenced)
        #expect(throws: (any Error).self) { try validate(englishNotes.replacingOccurrences(of: "API review", with: "API review\n\n~~~text\nUnfinished")) }

    }
    @Test(arguments: ["```", "~~~"])
    func codeBlocksRespectClosingSyntaxAndListContainers(marker: String) async throws {
        for body in [marker + "text\nExample\n" + marker + " " + marker,
                     "- item\n  " + marker + "\n  Example\n" + marker] {
            let malformed = englishNotes.replacingOccurrences(of: "- No decision was made", with: body)
            #expect(throws: (any Error).self) { try validate(malformed) }
        }
        for body in [marker + "text\n## Example\n" + marker + String(marker.prefix(1)) + "\t ",
                     "- item\n  " + marker + "\n  ## Example\n  " + marker] {
            let valid = englishNotes.replacingOccurrences(of: "- No decision was made", with: body)
            #expect(try validate(valid) == valid)
        }
        // CommonMark permits a final code block to end at EOF. Every required section is still visible.
        let finalBlock = englishNotes + "\n" + marker + "text\nExample\n"
        #expect(try validate(finalBlock) == finalBlock)
    }
    @Test(arguments: [russianNotes, englishNotes], [0, 1, 2, 3])
    func eachRequiredSectionMustHaveContent(markdown: String, index: Int) {
        var sections = markdown.components(separatedBy: "\n\n## ")
        sections[index] = String(sections[index].components(separatedBy: "\n\n")[0]) + "\n"
        #expect(throws: (any Error).self) { try validate(sections.joined(separator: "\n\n## ")) }
    }
}
private func validate(_ output: String) throws -> String {
    let template = Template(name: "Bilingual", instructions: "Fixture instructions", headings: [
        [.init("What this was about"), .init("Key points"), .init("Decisions"), .init("Actions"), .init("Open questions", required: false)],
        [.init("О чём встреча"), .init("Ключевые моменты"), .init("Решения"), .init("Задачи"), .init("Открытые вопросы", required: false)],
    ])
    return try Generator.validate(output, template: template)
}
private let russianNotes = "## О чём встреча\n\nОбсуждение API\n\n## Ключевые моменты\n\n- Обсудили API без решения\n\n## Решения\n\nНе зафиксировано.\n\n## Задачи\n\nНе зафиксировано.\n"
private let englishNotes = "## What this was about\n\nAPI review\n\n## Key points\n\n- No decision was made\n\n## Decisions\n\nNone recorded.\n\n## Actions\n\nNone recorded.\n"
