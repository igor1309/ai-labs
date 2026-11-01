@testable import Composer
import Synchronization

final class ReadingClockSpy: Sendable {

    private let time = Mutex(100.0)
    private let outputs = Mutex<[AsyncStream<Void>.Continuation]>([])

    func panel() -> AudelinPanel {
        AudelinPanel(now: now, ticks: ticks, sink: TestLogSink(), intervals: testIntervals)
    }

    func now() -> Double { time.withLock { $0 } }

    func ticks() -> AsyncStream<Void> {

        let (stream, output) = AsyncStream<Void>.makeStream()
        outputs.withLock { $0.append(output) }
        return stream
    }

    func advance(_ seconds: Double) {

        time.withLock { $0 += seconds }
        for output in outputs.withLock({ $0 }) { output.yield(()) }
    }
}

