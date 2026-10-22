import Foundation
import Testing
@testable import TranscriptCore

/// ADR-001 acceptance: a restart at the watermark, with windows shifted by a
/// few frames, logs no word twice and loses none on the recorded fixtures.
@Suite struct RecordedRestartTests {
    @Test func aWholeRunCommitsEveryWordOnceInTimeOrder() throws {
        for shift in ["0", "0.24"] {
            var stabilizer = Stabilizer(epoch: 0)
            let words = stabilizer.run(try Fixtures.terms(shift: shift))

            #expect(stabilizer.tail.isEmpty)
            expectOnceInOrder(words)
        }
    }

    @Test(arguments: ["0", "0.24"], 1..<16)
    func aRestartWithShiftedWindowsLosesNoWordAndRepeatsNone(from shift: String, after count: Int) throws {
        let first = try Fixtures.terms(shift: shift)
        let shifted = try Fixtures.terms(shift: shift == "0" ? "0.24" : "0")

        var attempt = Stabilizer(epoch: 0)
        let before = attempt.run(first.prefix(count))
        // The new attempt reads from the first shifted window whose chunk
        // reaches past the watermark, with its left context for context.
        let from = try #require(shifted.firstIndex { $0.rightContextFrom > attempt.watermark })
        var restart = Stabilizer(epoch: 0, watermark: attempt.watermark, lastCommitted: before)
        let after = restart.run(shifted[from...])
        let logged = before + after

        expectOnceInOrder(logged)
        // None lost: each word a whole run commits has a logged word at its
        // middle, from the first run before the watermark and from the
        // shifted run after it.
        var whole = Stabilizer(epoch: 0)
        var wholeShifted = Stabilizer(epoch: 0)
        let expected = whole.run(first).filter { $0.middle < attempt.watermark }
            + wholeShifted.run(shifted).filter { $0.middle >= attempt.watermark }
        for word in expected {
            #expect(
                logged.contains { $0.start <= word.middle && word.middle <= $0.end + 0.08 },
                "lost «\(word.text)» at \(word.start) after a restart at \(attempt.watermark)")
        }
    }

    /// No two logged words repeat the same text at overlapping times, and
    /// words are logged in time order.
    private func expectOnceInOrder(_ words: [Word], sourceLocation: SourceLocation = #_sourceLocation) {
        for (earlier, later) in zip(words, words.dropFirst()) {
            #expect(earlier.start <= later.start, "«\(later.text)» at \(later.start) logged out of order", sourceLocation: sourceLocation)
            let overlap = min(earlier.end, later.end) - max(earlier.start, later.start)
            let repeated = Stabilizer.normalized(earlier.text) == Stabilizer.normalized(later.text)
            #expect(!(repeated && overlap > 0), "«\(later.text)» at \(later.start) logged twice", sourceLocation: sourceLocation)
        }
    }
}
