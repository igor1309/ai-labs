import FolioTellCore
import Testing

struct SpeechTextNormalizationTests {

    @Test func test_speechText_shouldReturnTextUnchanged_onPlainText() {

        let text = "Мороз и солнце, день чудесный! Ещё ты дремлешь, друг прелестный."

        #expect(SpeechTextNormalization.speechText(from: text) == text)
    }

    @Test func test_speechText_shouldRemoveLeadingBOM_onBOMPrefixedText() {

        #expect(SpeechTextNormalization.speechText(from: "\u{feff}Мороз и солнце") == "Мороз и солнце")
    }

    @Test func test_speechText_shouldStripHeadingMarkers_onATXHeading() {

        let text = """
        # Зимнее утро
        ### Глава первая
        Мороз и солнце
        """

        #expect(SpeechTextNormalization.speechText(from: text) == """
        Зимнее утро
        Глава первая
        Мороз и солнце
        """)
    }

    @Test func test_speechText_shouldPreserveHash_onHashWithoutSpace() {

        #expect(SpeechTextNormalization.speechText(from: "#hashtag остаётся") == "#hashtag остаётся")
    }

    @Test func test_speechText_shouldStripEmphasisMarkers_onPairedAsterisks() {

        #expect(SpeechTextNormalization.speechText(from: "Мороз *и солнце*, день чудесный") == "Мороз и солнце, день чудесный")
    }

    @Test func test_speechText_shouldStripStrongMarkers_onPairedDoubleAsterisks() {

        #expect(SpeechTextNormalization.speechText(from: "**Мороз** и солнце") == "Мороз и солнце")
    }

    @Test func test_speechText_shouldStripStrikethroughMarkers_onPairedTildes() {

        #expect(SpeechTextNormalization.speechText(from: "Мороз и ~~луна~~ солнце") == "Мороз и луна солнце")
    }

    @Test func test_speechText_shouldStripUnderscoreMarkers_onPairedUnderscores() {

        #expect(SpeechTextNormalization.speechText(from: "_Зимнее_ и __утро__") == "Зимнее и утро")
    }

    @Test func test_speechText_shouldPreserveUnderscores_onWordInternalUnderscores() {

        #expect(SpeechTextNormalization.speechText(from: "Файл А_С_Пушкин_Зимнее_утро сохранён") == "Файл А_С_Пушкин_Зимнее_утро сохранён")
    }

    @Test func test_speechText_shouldPreserveMarker_onUnpairedEmphasisMarker() {

        #expect(SpeechTextNormalization.speechText(from: "2 * 3 равно 6") == "2 * 3 равно 6")
    }

    @Test func test_speechText_shouldStripBackticks_onInlineCode() {

        #expect(SpeechTextNormalization.speechText(from: "Запусти `swift test` сейчас") == "Запусти swift test сейчас")
    }

    @Test func test_speechText_shouldRemoveFenceLinesAndKeepContentVerbatim_onFencedCodeBlock() {

        let text = """
        Смотри:
        ```swift
        let snow = "*не жирный*"
        ```
        Готово
        """

        #expect(SpeechTextNormalization.speechText(from: text) == """
        Смотри:
        let snow = "*не жирный*"
        Готово
        """)
    }

    @Test func test_speechText_shouldSpeakLinkText_onInlineLink() {

        #expect(SpeechTextNormalization.speechText(from: "Читай [Зимнее утро](https://example.com/poem) вслух") == "Читай Зимнее утро вслух")
    }

    @Test func test_speechText_shouldSpeakAltText_onImage() {

        #expect(SpeechTextNormalization.speechText(from: "Вот ![зимний пейзаж](winter.png) утром") == "Вот зимний пейзаж утром")
    }

    @Test func test_speechText_shouldStripListMarkers_onBulletAndOrderedItems() {

        let text = """
        - мороз
        * солнце
          + лес
        1. речка
        2) печь
        """

        #expect(SpeechTextNormalization.speechText(from: text) == """
        мороз
        солнце
        лес
        речка
        печь
        """)
    }

    @Test func test_speechText_shouldStripQuoteMarkers_onNestedBlockquote() {

        let text = """
        > Мороз и солнце
        > > день чудесный
        """

        #expect(SpeechTextNormalization.speechText(from: text) == """
        Мороз и солнце
        день чудесный
        """)
    }

    @Test func test_speechText_shouldRemoveLine_onThematicBreakAndYAMLDelimiter() {

        let text = """
        Один
        ---
        ***
        ___
        ...
        Два
        """

        #expect(SpeechTextNormalization.speechText(from: text) == """
        Один
        Два
        """)
    }

    @Test func test_speechText_shouldCollapseBlankLines_onRemovedMarkupLines() {

        let text = """

        Один

        ---

        Два

        """

        #expect(SpeechTextNormalization.speechText(from: text) == """
        Один

        Два
        """)
    }

    @Test func test_speechText_shouldSpeakYAMLContentWithoutDelimiters_onReadModeFrontMatter() {

        let text = """
        ---
        title: "Зимнее утро"
        ---
        Мороз и солнце
        """

        #expect(SpeechTextNormalization.speechText(from: FrontMatterPlaybackMode.read.speechText(from: text)) == """
        title: "Зимнее утро"
        Мороз и солнце
        """)
    }

    @Test func test_speechText_shouldSpeakContentOnly_onPushkinShapedMarkdown() {

        let text = """
        \u{feff}---
        date: "2026-07-06"
        source_title: "А.С. Пушкин - Зимнее утро | Стихи слушать"
        transcript_method: "Method G — remote transcription"
        status: "sanity-checked"
        ---

        # А.С. Пушкин - Зимнее утро | Стихи слушать

        Мороз и солнце, день чудесный! Ещё ты дремлешь, друг прелестный.
        """

        #expect(SpeechTextNormalization.speechText(from: FrontMatterPlaybackMode.skip.speechText(from: text)) == """
        А.С. Пушкин - Зимнее утро | Стихи слушать

        Мороз и солнце, день чудесный! Ещё ты дремлешь, друг прелестный.
        """)
    }

    @Test func test_speechText_shouldStripMarkersOnly_onMixedMarkdownAndPlainText() {

        let text = """
        # Заметка

        Обычный текст остаётся как есть.

        - **Мороз** и солнце
        - Читай [стихи](https://example.com) с `выражением`

        И снова обычный текст.
        """

        #expect(SpeechTextNormalization.speechText(from: text) == """
        Заметка

        Обычный текст остаётся как есть.

        Мороз и солнце
        Читай стихи с выражением

        И снова обычный текст.
        """)
    }
}
