import Foundation

/// A signal whose every sample is distinct, so a misplaced sample shows.
public enum Sweep {
    public static let rate = 16_000.0

    /// The samples from `start` for `seconds`, on the session clock.
    public static func samples(from start: Double, seconds: Double, tone: Double? = nil) -> [Float] {
        let first = Int((start * rate).rounded())
        let count = Int((seconds * rate).rounded())
        return (first..<first + count).map { index in
            if let tone { return Float(sin(2 * .pi * tone * Double(index) / rate)) }
            return Float(index) / Float(1 << 24)
        }
    }
}
