import NotesMarkdown
import Testing

struct NotesGistTests {

    @Test func theGistIsTheFirstSentenceUnderTheFirstHeading() {

        let notes = "<!-- audelin-summary:x -->\n## О чём встреча\n\nОбсудили идентификаторы. Также пополнение.\n\n## Ключевые моменты\n\n- Пункт."

        #expect(NotesMarkdown.gist(notes) == "Обсудили идентификаторы.")
    }

    @Test func englishNotesGiveTheirFirstSentenceToo() {

        #expect(NotesMarkdown.gist("## What this was about\n\nRelease planning! Then risks.") == "Release planning!")
    }

    @Test func inlineMarkdownIsDroppedAndLinesJoined() {

        let notes = "## О чём встреча\n\nСинк по **OKR** и `SLA`\nна квартал? Дальше."

        #expect(NotesMarkdown.gist(notes) == "Синк по OKR и SLA на квартал?")
    }

    @Test func aParagraphWithoutAStopIsTheGistWhole() {

        #expect(NotesMarkdown.gist("## О чём встреча\n\nКороткий синк по задачам") == "Короткий синк по задачам")
    }

    @Test func aDotInsideAWordDoesNotEndTheSentence() {

        #expect(NotesMarkdown.gist("## О чём встреча\n\nВерсия 2.1 и файл summary.md готовы. Ещё.") == "Версия 2.1 и файл summary.md готовы.")
    }

    @Test func noGistWithoutAHeadingOrItsParagraph() {

        #expect(NotesMarkdown.gist("Просто текст.") == nil)
        #expect(NotesMarkdown.gist("## О чём встреча\n\n## Ключевые моменты\n\nТекст.") == nil)
        #expect(NotesMarkdown.gist("## О чём встреча\n\n- Список, не абзац.") == nil)
        #expect(NotesMarkdown.gist("") == nil)
    }

    @Test func aSectionOpeningWithAnotherBlockHasNoGist() {

        for opening in ["- Пункт.", "1. Пункт.", "> Цитата.", "```\ncode\n```"] {
            #expect(NotesMarkdown.gist("## О чём встреча\n\n\(opening)\n\nПотом абзац.") == nil)
        }
    }

    @Test func dashesAndQuotesStayAsWritten() {

        #expect(NotesMarkdown.gist("## Итоги\n\nA -- B \"C\".") == "A -- B \"C\".")
    }
}
