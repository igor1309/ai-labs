import FolioTellCore
import Testing

struct FrontMatterRenderingTests {

    @Test func test_renderableText_shouldSplitFrontMatter_onYAMLBlock() {

        let text = """
        ---
        title: Winter Morning
        ---
        Body starts here.
        """

        #expect(
            FrontMatterRendering.renderableText(from: text) == FrontMatterRendering(
                frontMatter: "---\ntitle: Winter Morning\n---",
                body: "Body starts here."
            )
        )
    }

    @Test func test_renderableText_shouldSplitFrontMatter_onUTF8BOMPrefix() {

        let text = """
        \u{feff}---
        title: Winter Morning
        ---
        Body starts here.
        """

        #expect(
            FrontMatterRendering.renderableText(from: text) == FrontMatterRendering(
                frontMatter: "---\ntitle: Winter Morning\n---",
                body: "Body starts here."
            )
        )
    }

    @Test func test_renderableText_shouldPreserveText_onMissingFrontMatter() {

        #expect(
            FrontMatterRendering.renderableText(from: "Body starts here.") == FrontMatterRendering(
                frontMatter: nil,
                body: "Body starts here."
            )
        )
    }
}
