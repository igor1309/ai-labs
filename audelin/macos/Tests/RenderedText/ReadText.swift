import CoreGraphics
import Vision

/// The words an image shows, read by Vision: SwiftUI's `Text` has no view and,
/// in a window that is never shown, no accessibility element to read.
public func readText(in image: CGImage) throws -> RenderedText {

    let request = VNRecognizeTextRequest()
    request.recognitionLevel = .accurate
    request.recognitionLanguages = ["ru-RU", "en-US"]
    request.usesLanguageCorrection = false
    try VNImageRequestHandler(cgImage: image).perform([request])

    let lines = (request.results ?? []).compactMap { $0.topCandidates(1).first?.string }
    return RenderedText(lines: lines)
}

public struct RenderedText: Sendable, CustomStringConvertible {

    public let lines: [String]

    public init(lines: [String]) {

        self.lines = lines
    }

    /// Whether the words appear, wherever the layout wraps them. Case, spacing,
    /// punctuation and letters that look alike in Latin and Cyrillic do not
    /// count: the reader confuses them, and no state differs by them.
    public func shows(_ words: String) -> Bool {

        lines.joined().folded.contains(words.folded)
    }

    public var description: String { lines.joined(separator: " | ") }
}

private extension String {

    var folded: String {

        let lookalikes: [Character: Character] = [
            "а": "a", "в": "b", "е": "e", "к": "k", "м": "m", "н": "h", "о": "o",
            "р": "p", "с": "c", "т": "t", "у": "y", "х": "x", "0": "o", "п": "n", "и": "u",
        ]
        return String(lowercased().filter { $0.isLetter || $0.isNumber }.map { lookalikes[$0] ?? $0 })
    }
}
