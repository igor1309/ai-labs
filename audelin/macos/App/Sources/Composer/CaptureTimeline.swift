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
