package dev.igor1309.foliotell.core

data class Document(val name: String, val text: String)

enum class LoadError { EMPTY, INVALID_ENCODING }

sealed interface LoadResult {
    data class Loaded(val document: Document) : LoadResult
    data class Failed(val error: LoadError) : LoadResult
}

/**
 * Validates raw picked-document bytes into a readable [Document]: strict
 * UTF-8 only, non-blank content required.
 */
object DocumentLoader {

    fun load(bytes: ByteArray, name: String): LoadResult {
        val decoded = try {
            bytes.decodeToString(throwOnInvalidSequence = true)
        } catch (_: CharacterCodingException) {
            return LoadResult.Failed(LoadError.INVALID_ENCODING)
        }
        if ('\u0000' in decoded) return LoadResult.Failed(LoadError.INVALID_ENCODING)
        val text = decoded.removePrefix("\uFEFF")
        if (text.isBlank()) return LoadResult.Failed(LoadError.EMPTY)
        return LoadResult.Loaded(Document(name = name.ifBlank { "Untitled" }, text = text))
    }
}
