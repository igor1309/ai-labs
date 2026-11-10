import Foundation
import Session
import Synchronization

/// Capture audio starts at zero on each side; cleanup compares words in session time.
final class CaptureTimeline: Sendable {
    private let offsets = Mutex<[SessionSide: Double]>([:])

    func started(_ side: SessionSide, at offset: Double) {
        offsets.withLock { $0[side] = offset }
    }

    func offset(_ side: SessionSide) -> Double { offsets.withLock { $0[side] ?? 0 } }
}

extension TranscriptSegment {
    func offset(by offset: Double) -> Self {
        .init(id: id, start: start + offset, end: end + offset,
              words: words.map { .init($0.text, start: $0.start + offset, end: $0.end + offset) },
              settledCount: settledCount)
    }
}
