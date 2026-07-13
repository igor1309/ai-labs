import FolioTellCore
import Testing

struct FrontMatterPlaybackModeTests {

    @Test func test_speechText_shouldSkipFrontMatter_onSkipMode() {

        let text = """
        ---
        title: Winter Morning
        date: 2026-07-06
        ---
        Body starts here.
        """

        #expect(FrontMatterPlaybackMode.skip.speechText(from: text) == "Body starts here.")
    }

    @Test func test_speechText_shouldSkipFrontMatter_onUTF8BOMPrefix() {

        let text = """
        \u{feff}---
        title: Winter Morning
        ---
        Body starts here.
        """

        #expect(FrontMatterPlaybackMode.skip.speechText(from: text) == "Body starts here.")
    }

    @Test func test_speechText_shouldReadFrontMatter_onReadMode() {

        let text = """
        ---
        title: Winter Morning
        ---
        Body starts here.
        """

        #expect(FrontMatterPlaybackMode.read.speechText(from: text) == text)
    }

    @Test func test_speechText_shouldPreserveText_onMissingClosingFrontMatterDelimiter() {

        let text = """
        ---
        title: Winter Morning
        Body starts here.
        """

        #expect(FrontMatterPlaybackMode.skip.speechText(from: text) == text)
    }

    @Test func test_mode_shouldReturnSkip_onUnknownRawValue() {

        #expect(FrontMatterPlaybackMode.mode(for: "unknown") == .skip)
    }
}
