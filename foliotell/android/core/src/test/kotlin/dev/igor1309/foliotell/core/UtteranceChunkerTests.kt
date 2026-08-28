package dev.igor1309.foliotell.core

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertTrue

class UtteranceChunkerTests {

    @Test
    fun test_chunk_shouldThrow_onNonPositiveLimit() {
        assertFailsWith<IllegalArgumentException> {
            UtteranceChunker.chunk("text", maxChunkLength = 0)
        }
    }

    @Test
    fun test_chunk_shouldReturnEmptyList_onBlankText() {
        assertEquals(emptyList(), UtteranceChunker.chunk(" \n\t\n ", maxChunkLength = 100))
    }

    @Test
    fun test_chunk_shouldReturnSingleChunk_onParagraphWithinLimit() {
        assertEquals(
            listOf("One short paragraph."),
            UtteranceChunker.chunk("One short paragraph.", maxChunkLength = 100),
        )
    }

    @Test
    fun test_chunk_shouldSplitAtParagraphBoundaries_onMultipleParagraphs() {
        val text = "First paragraph.\n\nSecond paragraph.\n\n\n\nThird paragraph."

        assertEquals(
            listOf("First paragraph.", "Second paragraph.", "Third paragraph."),
            UtteranceChunker.chunk(text, maxChunkLength = 100),
        )
    }

    @Test
    fun test_chunk_shouldPackWholeSentencesUpToLimit_onOversizedParagraph() {
        val text = "One two three. Four five six. Seven eight nine ten eleven."

        assertEquals(
            listOf("One two three. Four five six.", "Seven eight nine ten eleven."),
            UtteranceChunker.chunk(text, maxChunkLength = 40),
        )
    }

    @Test
    fun test_chunk_shouldSplitAtLastWhitespaceBeforeLimit_onOversizedSentence() {
        assertEquals(
            listOf("alphabet", "soup again"),
            UtteranceChunker.chunk("alphabet soup again", maxChunkLength = 10),
        )
    }

    @Test
    fun test_chunk_shouldHardSplitAtLimit_onUnbrokenRunOverLimit() {
        assertEquals(
            listOf("abcd", "efgh", "ij"),
            UtteranceChunker.chunk("abcdefghij", maxChunkLength = 4),
        )
    }

    @Test
    fun test_chunk_shouldTrimChunks_onWhitespaceAroundParagraphs() {
        val text = "  First one.  \n\n\t Second one. \t"

        assertEquals(
            listOf("First one.", "Second one."),
            UtteranceChunker.chunk(text, maxChunkLength = 100),
        )
    }

    @Test
    fun test_chunk_shouldKeepEveryChunkWithinLimit_onMixedDocument() {
        val chunks = UtteranceChunker.chunk(MIXED_DOCUMENT, maxChunkLength = 25)

        assertTrue(chunks.isNotEmpty())
        chunks.forEach { chunk ->
            assertTrue(chunk.isNotBlank())
            assertTrue(chunk.length <= 25, "over limit: \"$chunk\"")
        }
    }

    @Test
    fun test_chunk_shouldPreserveNonWhitespaceContentInOrder_onMixedDocument() {
        val chunks = UtteranceChunker.chunk(MIXED_DOCUMENT, maxChunkLength = 25)

        assertEquals(
            MIXED_DOCUMENT.filterNot { it.isWhitespace() },
            chunks.joinToString("").filterNot { it.isWhitespace() },
        )
    }

    private companion object {
        val MIXED_DOCUMENT = """
            # Heading

            Short paragraph. It has two sentences!

            A single overlong sentence that must break at whitespace somewhere.

            Unbroken${"x".repeat(40)}run.
        """.trimIndent()
    }
}
