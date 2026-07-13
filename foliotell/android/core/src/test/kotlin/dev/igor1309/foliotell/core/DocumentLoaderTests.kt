package dev.igor1309.foliotell.core

import kotlin.test.Test
import kotlin.test.assertEquals

class DocumentLoaderTests {

    @Test
    fun test_load_shouldReturnDocumentText_onValidUtf8() {
        val result = DocumentLoader.load("# Título\n\nBody.".encodeToByteArray(), "notes.md")

        assertEquals(LoadResult.Loaded(Document(name = "notes.md", text = "# Título\n\nBody.")), result)
    }

    @Test
    fun test_load_shouldStripLeadingBom_onUtf8WithBom() {
        val bytes = byteArrayOf(0xEF.toByte(), 0xBB.toByte(), 0xBF.toByte()) + "Hello".encodeToByteArray()

        val result = DocumentLoader.load(bytes, "bom.txt")

        assertEquals(LoadResult.Loaded(Document(name = "bom.txt", text = "Hello")), result)
    }

    @Test
    fun test_load_shouldFailEmpty_onEmptyBytes() {
        assertEquals(LoadResult.Failed(LoadError.EMPTY), DocumentLoader.load(ByteArray(0), "empty.txt"))
    }

    @Test
    fun test_load_shouldFailEmpty_onWhitespaceOnlyText() {
        val bytes = " \n\t  \n".encodeToByteArray()

        assertEquals(LoadResult.Failed(LoadError.EMPTY), DocumentLoader.load(bytes, "blank.txt"))
    }

    @Test
    fun test_load_shouldFailEmpty_onBomOnlyBytes() {
        val bytes = byteArrayOf(0xEF.toByte(), 0xBB.toByte(), 0xBF.toByte())

        assertEquals(LoadResult.Failed(LoadError.EMPTY), DocumentLoader.load(bytes, "bom-only.txt"))
    }

    @Test
    fun test_load_shouldFailInvalidEncoding_onMalformedUtf8() {
        val bytes = byteArrayOf(0xC3.toByte(), 0x28) // truncated two-byte sequence

        assertEquals(LoadResult.Failed(LoadError.INVALID_ENCODING), DocumentLoader.load(bytes, "latin1.txt"))
    }

    @Test
    fun test_load_shouldFailInvalidEncoding_onTextContainingNul() {
        val bytes = byteArrayOf(0x48, 0x00, 0x69, 0x00) // "Hi" as BOM-less UTF-16LE

        assertEquals(LoadResult.Failed(LoadError.INVALID_ENCODING), DocumentLoader.load(bytes, "utf16.txt"))
    }

    @Test
    fun test_load_shouldUseProvidedName_onValidDocument() {
        val result = DocumentLoader.load("text".encodeToByteArray(), "given-name.markdown")

        assertEquals(LoadResult.Loaded(Document(name = "given-name.markdown", text = "text")), result)
    }

    @Test
    fun test_load_shouldFallBackToUntitled_onBlankName() {
        val result = DocumentLoader.load("text".encodeToByteArray(), "  ")

        assertEquals(LoadResult.Loaded(Document(name = "Untitled", text = "text")), result)
    }
}
