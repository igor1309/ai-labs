---
date: 2026-07-08
model: claude-fable-5
description: "Spec: SpeechTextNormalization — content-only speech string for FolioTell playback"
---

# Spec: SpeechTextNormalization (v1)

Delta mini-spec (my-way minor-feature path) for the backlog item "Normalize
text for speech" in `foliotell/backlog/product.md`. Intake:
[`../speech-normalization-intake.md`](../speech-normalization-intake.md).

## Goal

A pure `FolioTellCore` transformation that converts a Markdown or plain-text
document string into the content-only string handed to speech synthesis, so
playback speaks document content instead of raw markup. Owned by
`FolioTellCore`; consumed by the reader's speech path only.

## Public interface

```swift
public enum SpeechTextNormalization {
    /// Content-only speech text for a Markdown or plain-text document body.
    public static func speechText(from text: String) -> String
}
```

Pipeline composition (App layer, single speech-string definition used for
playback, language detection, and voice filtering):

```swift
SpeechTextNormalization.speechText(
    from: selectedFrontMatterMode.speechText(from: document.text)
)
```

Front-matter handling stays in `FrontMatterPlaybackMode.speechText(from:)`
and runs first; normalization runs on its output.

## Behavior rules

1. **Plain text passthrough.** Text containing no Markdown markers is
   returned with content intact (mixed Markdown/plain-text documents lose
   only markers, never content words).
2. **Leading BOM.** A leading U+FEFF is removed.
3. **ATX headings.** Leading `#`–`######` followed by a space is stripped;
   the heading text is kept. A `#` not followed by a space (e.g. `#tag`) is
   left alone.
4. **Emphasis markers.** Paired `**`, `*`, `__`, `_`, `~~` spans lose their
   markers and keep their content. Unpaired markers are left as-is.
   Word-internal underscores (e.g. `snake_case`, `А_С_Пушкин`) are preserved.
5. **Inline code.** Paired backticks are stripped; the enclosed text is kept.
6. **Fenced code blocks.** Fence lines (``` or `~~~`, with optional info
   string) are removed; enclosed lines are kept verbatim (no inline
   processing inside the fence).
7. **Links and images.** `[text](url)` becomes `text`; `![alt](url)` becomes
   `alt`. URLs are never spoken.
8. **List markers.** A leading `-`, `*`, `+`, or `N.`/`N)` marker followed by
   a space is stripped, tolerant of leading indentation; item text is kept.
9. **Blockquote markers.** Leading `>` markers (including nested `> >`) are
   stripped; quoted text is kept.
10. **Delimiter-only lines.** Lines consisting solely of a thematic break or
    YAML delimiter (`---`, `***`, `___`, `...`, three or more marker
    characters, optional surrounding whitespace) are removed entirely. This
    also covers front-matter delimiters when
    `FrontMatterPlaybackMode.read` passes front matter through: the YAML
    content lines are spoken, the `---`/`...` delimiters are not.
11. **No blank-line residue.** Removed lines leave no extra blank lines;
    runs of blank lines collapse to a single blank line; the result is
    trimmed of leading/trailing whitespace.
12. **Speech path only.** The normalizer is used exclusively to build the
    speech string. `FrontMatterRendering` and the reader's visual document
    rendering are unchanged.

## Product intent traceability

Backlog bullets → rules: "strip skipped leading YAML front matter" stays with
`FrontMatterPlaybackMode` (pipeline order, Public interface); "strip Markdown
formatting markers, headings, link syntax, and other structural punctuation"
→ rules 3–10; "keep the visual document rendering separate" → rule 12;
"cover the supplied Pushkin Markdown sample and mixed Markdown/plain-text
cases" → rules 1–3, 10 and the Pushkin-shaped test below (inline test string
mirroring the sample's load-bearing features per intake decision).

## Tests (required)

Pure helper tests in `Tests/Core/SpeechTextNormalizationTests.swift`:

1. `test_speechText_shouldReturnTextUnchanged_onPlainText` — rule 1.
2. `test_speechText_shouldRemoveLeadingBOM_onBOMPrefixedText` — rule 2.
3. `test_speechText_shouldStripHeadingMarkers_onATXHeading` — rule 3.
4. `test_speechText_shouldPreserveHash_onHashWithoutSpace` — rule 3.
5. `test_speechText_shouldStripEmphasisMarkers_onPairedAsterisks` — rule 4.
6. `test_speechText_shouldStripStrongMarkers_onPairedDoubleAsterisks` — rule 4.
7. `test_speechText_shouldStripStrikethroughMarkers_onPairedTildes` — rule 4.
8. `test_speechText_shouldPreserveUnderscores_onWordInternalUnderscores` — rule 4.
9. `test_speechText_shouldPreserveMarker_onUnpairedEmphasisMarker` — rule 4.
10. `test_speechText_shouldStripBackticks_onInlineCode` — rule 5.
11. `test_speechText_shouldRemoveFenceLines_onFencedCodeBlock` — rule 6.
12. `test_speechText_shouldSpeakLinkText_onInlineLink` — rule 7.
13. `test_speechText_shouldSpeakAltText_onImage` — rule 7.
14. `test_speechText_shouldStripListMarkers_onBulletAndOrderedItems` — rule 8.
15. `test_speechText_shouldStripQuoteMarkers_onNestedBlockquote` — rule 9.
16. `test_speechText_shouldRemoveLine_onThematicBreak` — rule 10.
17. `test_speechText_shouldCollapseBlankLines_onRemovedMarkupLines` — rule 11.
18. `test_speechText_shouldSpeakContentOnly_onPushkinShapedMarkdown` — rules
    2, 3, 11 combined: an inline document string that is a valid artifact —
    UTF-8 BOM prefix, multi-line quoted-value YAML front matter, a `#`
    heading, and a Russian plain-text paragraph — normalized (after skip-mode
    front-matter stripping) to heading text plus paragraph.
19. `test_speechText_shouldSpeakYAMLContentWithoutDelimiters_onReadModeFrontMatter`
    — rule 10: read-mode output keeps `key: "value"` lines, drops `---`.
20. `test_speechText_shouldStripMarkersOnly_onMixedMarkdownAndPlainText` —
    rules 1 + 3–8 combined on a mixed document.

## Done criteria

- `SpeechTextNormalization.speechText(from:)` exists in `FolioTellCore` with
  the interface above; no new package dependencies.
- All listed tests pass (`swift test` green in `foliotell/`).
- Reader speech path (playback and `documentSpeechText` for language
  detection) uses the composed pipeline; visual rendering code paths are
  untouched by the diff.
- Existing `FrontMatterPlaybackMode` and `FrontMatterRendering` tests still
  pass unchanged.

Out of scope: tables, raw HTML, reference-style links/footnotes, setext
headings, backslash-escape handling, autolinks in angle brackets, visual
Markdown rendering (separate backlog item).
