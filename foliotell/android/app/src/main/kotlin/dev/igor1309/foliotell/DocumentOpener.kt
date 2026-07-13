package dev.igor1309.foliotell

import android.content.ContentResolver
import android.net.Uri
import android.provider.OpenableColumns
import dev.igor1309.foliotell.core.Document
import dev.igor1309.foliotell.core.DocumentLoader
import dev.igor1309.foliotell.core.LoadError
import dev.igor1309.foliotell.core.LoadResult
import java.io.IOException

sealed interface OpenOutcome {
    data class Opened(val document: Document) : OpenOutcome
    data class Failed(val message: String) : OpenOutcome
}

/**
 * Reads a picked SAF document and validates it through the core loader,
 * mapping every failure to the concise message the open screen shows.
 */
fun openDocument(contentResolver: ContentResolver, uri: Uri): OpenOutcome {
    val bytes = try {
        contentResolver.openInputStream(uri)?.use { it.readBytes() }
            ?: return OpenOutcome.Failed(UNREADABLE_MESSAGE)
    } catch (_: IOException) {
        return OpenOutcome.Failed(UNREADABLE_MESSAGE)
    } catch (_: SecurityException) {
        return OpenOutcome.Failed(UNREADABLE_MESSAGE)
    }
    val name = displayName(contentResolver, uri) ?: uri.lastPathSegment.orEmpty()
    return when (val result = DocumentLoader.load(bytes, name)) {
        is LoadResult.Loaded -> OpenOutcome.Opened(result.document)
        is LoadResult.Failed -> OpenOutcome.Failed(
            when (result.error) {
                LoadError.EMPTY -> "This file is empty."
                LoadError.INVALID_ENCODING -> "This file isn't UTF-8 text."
            },
        )
    }
}

private fun displayName(contentResolver: ContentResolver, uri: Uri): String? = try {
    contentResolver.query(uri, arrayOf(OpenableColumns.DISPLAY_NAME), null, null, null)
        ?.use { cursor -> if (cursor.moveToFirst()) cursor.getString(0) else null }
} catch (_: Exception) {
    null
}

private const val UNREADABLE_MESSAGE = "Can't read this file."
