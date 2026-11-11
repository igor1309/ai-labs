import Foundation

/// A recognised word and when it starts, in call time.
public struct Word: Equatable, Sendable {

    public let start: Double
    public let text: String

    public init(start: Double, text: String) {

        self.start = start
        self.text = text
    }
}

/// Decides from a call's two transcripts whether the far side leaked into the
/// microphone: a microphone word is leaked when the call track has the same word
/// within `window` seconds and so does a neighbouring microphone word. The call
/// is gated when leaked words reach `perMinute` a minute of microphone audio.
public struct BleedGate: Sendable {

    public let window: Double
    public let perMinute: Double

    public init(window: Double = 2, perMinute: Double = 3) {

        self.window = window
        self.perMinute = perMinute
    }

    public func leaked(microphone: [Word], call: [Word]) -> Int {

        let heard = call.map { (start: $0.start, text: Self.normalized($0.text)) }
        let hits = microphone.map { word in
            let text = Self.normalized(word.text)
            return !text.isEmpty && heard.contains { $0.text == text && abs($0.start - word.start) <= window }
        }
        return hits.indices.filter { i in
            hits[i] && ((i > 0 && hits[i - 1]) || (i + 1 < hits.count && hits[i + 1]))
        }.count
    }

    public func isGated(microphone: [Word], call: [Word], duration: Double) -> Bool {

        guard duration > 0 else { return false }
        return Double(leaked(microphone: microphone, call: call)) / (duration / 60) >= perMinute
    }

    private static func normalized(_ text: String) -> String {

        String(text.lowercased().replacingOccurrences(of: "ё", with: "е")
            .unicodeScalars.filter { CharacterSet.alphanumerics.contains($0) || $0 == "'" }
            .map(Character.init))
    }
}
