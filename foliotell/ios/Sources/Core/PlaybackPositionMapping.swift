import Foundation

public enum PlaybackPositionMapping {

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
