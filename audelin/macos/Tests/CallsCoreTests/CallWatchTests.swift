import CallsCore
import Foundation
import Testing

@Suite struct CallWatchTests {
    @Test func cancellingStopsTheWatch() {
        let stops = Counter()
        let watch = CallWatch { stops.add() }

        watch.cancel()

        #expect(stops.value == 1)
    }

    @Test func releasingStopsTheWatch() {
        let stops = Counter()
        var watch: CallWatch? = CallWatch { stops.add() }
        _ = watch

        watch = nil

        #expect(stops.value == 1)
    }

    @Test func aCancelledWatchStopsOnce() {
        let stops = Counter()
        var watch: CallWatch? = CallWatch { stops.add() }

        watch?.cancel()
        watch?.cancel()
        watch = nil

        #expect(stops.value == 1)
    }
}

private final class Counter: @unchecked Sendable {
    private let lock = NSLock()
    private var count = 0

    func add() { lock.withLock { count += 1 } }

    var value: Int { lock.withLock { count } }
}
