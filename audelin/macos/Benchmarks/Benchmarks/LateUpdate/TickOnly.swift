import Benchmark
import Foundation
import Synchronization

func tickBenchmarks() {

    for lines in [20, 800, 1_620, 6_000] {
        Benchmark(
            "One tick with \(lines) lines in the panel",
            configuration: .init(
                metrics: [.wallClock, .cpuTotal, .instructions, .mallocCountTotal],
                timeUnits: .microseconds,
                warmupIterations: 10,
                maxDuration: .seconds(20),
                maxIterations: 100
            ),
            closure: { benchmark, call in
                for _ in benchmark.scaledIterations { try await call.tick() }
            },
            setup: { try await TickCall.played(lines: lines) },
            teardown: { await Call.current?.end() }
        )
    }
}

/// The same long call as the word case, with no audio fed during measurement.
private final class TickCall: Sendable {

    let call: Call
    let clock: TickClock

    private init(call: Call, clock: TickClock) {
        self.call = call
        self.clock = clock
    }

    static func played(lines: Int) async throws -> TickCall {
        let clock = TickClock()
        let call = try await Call.played(lines: lines, tickClock: clock)
        return TickCall(call: call, clock: clock)
    }

    func tick() async throws {
        let seconds = clock.advance()
        let expected = String(format: "%02d:%02d:%02d", seconds / 3600, seconds / 60 % 60, seconds % 60)
        while let state = await call.shown.next() {
            if state.recording == .on(elapsed: expected) { return }
        }
        throw Failure.panelEnded
    }

    private enum Failure: Error { case panelEnded }
}

/// The stream buffers a tick until the panel consumes it; only the benchmark
/// advances this clock, so the next sample cannot finish on a timer's tick.
final class TickClock: Sendable {

    private let seconds = Mutex(0)
    private let source = AsyncStream<Void>.makeStream()

    var stream: AsyncStream<Void> { source.stream }

    func now() -> Double { seconds.withLock { Double($0) } }

    func advance() -> Int {
        let next = seconds.withLock { $0 += 1; return $0 }
        source.continuation.yield(())
        return next
    }
}
