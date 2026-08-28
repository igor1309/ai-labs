import Foundation

/// Cached derivation of the speech text for one (document, front-matter mode)
/// pair: normalized speech text, per-unit source offsets, and sentence starts.
/// Built once per document load or mode change; position queries are lookups.
public struct SpeechDerivation: Equatable, Sendable {

    public let speechText: String

    private let sourceOffsets: [Int]
    private let speechSentenceStarts: [Int]
    private let documentSentenceStarts: [Int]

    public init(documentText: String, frontMatterMode: FrontMatterPlaybackMode) {

        let speechText = SpeechTextNormalization.speechText(
            from: frontMatterMode.speechText(from: documentText)
        )
        self.speechText = speechText
        self.sourceOffsets = Self.subsequenceSourceUTF16Offsets(of: speechText, in: documentText)
        self.speechSentenceStarts = Self.sentenceStartUTF16Offsets(in: speechText)
        self.documentSentenceStarts = Self.sentenceStartUTF16Offsets(in: documentText)
    }

    /// Document-text UTF16 offset of the start of the sentence being spoken
    /// at `spokenUTF16Offset` in the speech text.
    public func documentAnchor(forSpokenUTF16Offset spokenUTF16Offset: Int) -> Int {

        let spokenSentenceStart = Self.sentenceStart(in: speechSentenceStarts, containing: spokenUTF16Offset)
        guard spokenSentenceStart < sourceOffsets.count else {
            return 0
        }

        return Self.sentenceStart(in: documentSentenceStarts, containing: sourceOffsets[spokenSentenceStart])
    }

    /// Document-text UTF16 offset of the speech-text position, without
    /// snapping to a sentence start. Drives live progress display.
    public func documentUTF16Offset(forSpokenUTF16Offset spokenUTF16Offset: Int) -> Int {

        guard sourceOffsets.isEmpty == false else {
            return 0
        }

        return sourceOffsets[min(max(spokenUTF16Offset, 0), sourceOffsets.count - 1)]
    }

    /// Speech-text UTF16 offset at which playback resumes a stored anchor.
    public func resumeSpokenUTF16Offset(forDocumentAnchor documentAnchor: Int) -> Int {

        guard let resumeIndex = sourceOffsets.firstIndex(where: { $0 >= documentAnchor }) else {
            return 0
        }

        return Self.sentenceStart(in: speechSentenceStarts, containing: resumeIndex)
    }

    /// Start of the sentence containing `utf16Offset`, given sorted sentence
    /// starts; 0 when the offset precedes every sentence. Binary search keeps
    /// the per-spoken-word callback path at O(log sentences).
    private static func sentenceStart(in sortedStarts: [Int], containing utf16Offset: Int) -> Int {

        var low = 0
        var high = sortedStarts.count
        while low < high {
            let mid = (low + high) / 2
            if sortedStarts[mid] <= utf16Offset {
                low = mid + 1
            } else {
                high = mid
            }
        }
        return low > 0 ? sortedStarts[low - 1] : 0
    }

    private static func sentenceStartUTF16Offsets(in text: String) -> [Int] {

        var starts: [Int] = []
        text.enumerateSubstrings(
            in: text.startIndex..<text.endIndex,
            options: [.bySentences, .substringNotRequired]
        ) { _, sentenceRange, _, _ in
            starts.append(text.utf16.distance(from: text.utf16.startIndex, to: sentenceRange.lowerBound))
        }
        return starts
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
}
