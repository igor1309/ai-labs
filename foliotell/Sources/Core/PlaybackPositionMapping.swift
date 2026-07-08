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
