import Foundation

public enum PlaybackPositionMapping {

    /// Document-text UTF16 offset of the start of the sentence being spoken
    /// at `spokenUTF16Offset` in the derived speech text.
    public static func documentAnchor(
        documentText: String,
        frontMatterMode: FrontMatterPlaybackMode,
        spokenUTF16Offset: Int
    ) -> Int {

        let speechText = SpeechTextNormalization.speechText(
            from: frontMatterMode.speechText(from: documentText)
        )
        let sourceOffsets = subsequenceSourceUTF16Offsets(of: speechText, in: documentText)
        let spokenSentenceStart = sentenceStartUTF16Offset(in: speechText, containing: spokenUTF16Offset)
        guard spokenSentenceStart < sourceOffsets.count else {
            return 0
        }

        return sentenceStartUTF16Offset(in: documentText, containing: sourceOffsets[spokenSentenceStart])
    }

    /// Document-text UTF16 offset of the speech-text position, without
    /// snapping to a sentence start. Drives live progress display; persisted
    /// positions use `documentAnchor` instead.
    public static func documentUTF16Offset(
        documentText: String,
        frontMatterMode: FrontMatterPlaybackMode,
        spokenUTF16Offset: Int
    ) -> Int {

        let speechText = SpeechTextNormalization.speechText(
            from: frontMatterMode.speechText(from: documentText)
        )
        let sourceOffsets = subsequenceSourceUTF16Offsets(of: speechText, in: documentText)
        guard sourceOffsets.isEmpty == false else {
            return 0
        }

        let boundedIndex = min(max(spokenUTF16Offset, 0), sourceOffsets.count - 1)
        return sourceOffsets[boundedIndex]
    }

    /// UTF16 offset of the start of the sentence preceding the one that
    /// contains `utf16Offset`; 0 when the containing sentence is the first.
    public static func previousSentenceStartUTF16Offset(in text: String, from utf16Offset: Int) -> Int {

        let containingStart = sentenceStartUTF16Offset(in: text, containing: utf16Offset)
        guard containingStart > 0 else {
            return 0
        }

        return sentenceStartUTF16Offset(in: text, containing: containingStart - 1)
    }

    /// UTF16 offset of the start of the sentence following the one that
    /// contains `utf16Offset`; nil when the containing sentence is the last.
    public static func nextSentenceStartUTF16Offset(in text: String, from utf16Offset: Int) -> Int? {

        let containingStart = sentenceStartUTF16Offset(in: text, containing: utf16Offset)
        var nextStart: Int?
        text.enumerateSubstrings(
            in: text.startIndex..<text.endIndex,
            options: [.bySentences, .substringNotRequired]
        ) { _, sentenceRange, _, stop in
            let sentenceStart = text.utf16.distance(from: text.utf16.startIndex, to: sentenceRange.lowerBound)
            if sentenceStart > containingStart {
                nextStart = sentenceStart
                stop = true
            }
        }
        return nextStart
    }

    /// Speech-text UTF16 offset at which playback resumes a stored anchor.
    public static func resumeSpokenUTF16Offset(
        documentText: String,
        frontMatterMode: FrontMatterPlaybackMode,
        documentAnchor: Int
    ) -> Int {

        let speechText = SpeechTextNormalization.speechText(
            from: frontMatterMode.speechText(from: documentText)
        )
        let sourceOffsets = subsequenceSourceUTF16Offsets(of: speechText, in: documentText)
        guard let resumeIndex = sourceOffsets.firstIndex(where: { $0 >= documentAnchor }) else {
            return 0
        }

        return sentenceStartUTF16Offset(in: speechText, containing: resumeIndex)
    }

    /// Document-text UTF16 offset of each speech-text UTF16 unit. The speech
    /// pipeline only deletes characters, so the speech text is a subsequence
    /// of the document text and greedy alignment is exact.
    private static func subsequenceSourceUTF16Offsets(of speechText: String, in documentText: String) -> [Int] {

        let documentUnits = Array(documentText.utf16)
        var sourceOffsets: [Int] = []
        sourceOffsets.reserveCapacity(speechText.utf16.count)
        var documentIndex = 0
        for speechUnit in speechText.utf16 {
            while documentIndex < documentUnits.count, documentUnits[documentIndex] != speechUnit {
                documentIndex += 1
            }
            guard documentIndex < documentUnits.count else {
                break
            }
            sourceOffsets.append(documentIndex)
            documentIndex += 1
        }
        return sourceOffsets
    }

    private static func sentenceStartUTF16Offset(in text: String, containing utf16Offset: Int) -> Int {

        var startOffset = 0
        text.enumerateSubstrings(
            in: text.startIndex..<text.endIndex,
            options: [.bySentences, .substringNotRequired]
        ) { _, sentenceRange, _, stop in
            let sentenceStart = text.utf16.distance(from: text.utf16.startIndex, to: sentenceRange.lowerBound)
            if sentenceStart <= utf16Offset {
                startOffset = sentenceStart
            } else {
                stop = true
            }
        }
        return startOffset
    }
}
