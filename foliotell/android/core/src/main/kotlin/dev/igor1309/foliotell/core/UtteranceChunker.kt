package dev.igor1309.foliotell.core

/**
 * Splits document text into the utterance-sized chunks handed to the TTS
 * engine. Every chunk fits the engine's per-utterance limit, and the current
 * chunk is the pause/resume and speed-change granularity.
 */
object UtteranceChunker {

    fun chunk(text: String, maxChunkLength: Int): List<String> {
        require(maxChunkLength >= 1) { "maxChunkLength must be positive: $maxChunkLength" }
        if (text.isBlank()) return emptyList()
        return text.split(PARAGRAPH_BREAK)
            .map { it.trim() }
            .filter { it.isNotEmpty() }
            .flatMap { paragraph -> chunkParagraph(paragraph, maxChunkLength) }
    }

    private fun chunkParagraph(paragraph: String, maxChunkLength: Int): List<String> {
        val chunks = mutableListOf<String>()
        var rest = paragraph
        while (rest.length > maxChunkLength) {
            val cut = lastSentenceEnd(rest, maxChunkLength)
                ?: lastWhitespace(rest, maxChunkLength)
                ?: maxChunkLength
            chunks += rest.substring(0, cut).trim()
            rest = rest.substring(cut).trimStart()
        }
        if (rest.isNotBlank()) chunks += rest.trim()
        return chunks
    }

    /**
     * The largest cut position within the limit that ends a sentence: the
     * character before it is sentence punctuation and the character at it is
     * whitespace.
     */
    private fun lastSentenceEnd(rest: String, maxChunkLength: Int): Int? =
        (maxChunkLength downTo 1).firstOrNull { cut ->
            rest[cut - 1] in SENTENCE_END && rest[cut].isWhitespace()
        }

    /** The largest cut position within the limit that falls on whitespace. */
    private fun lastWhitespace(rest: String, maxChunkLength: Int): Int? =
        (maxChunkLength downTo 1).firstOrNull { cut -> rest[cut].isWhitespace() }

    private val PARAGRAPH_BREAK = Regex("""\R\s*\R""")
    private const val SENTENCE_END = ".!?…"
}
