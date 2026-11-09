import Synchronization
import Testing

struct PlayerShutdownTests {

    @Test(arguments: ExitBehavior.allCases)
    func cleanupUsesLivenessAndBoundsBothSignals(_ behavior: ExitBehavior) async {

        let child = Child(behavior: behavior)
        let shutdown = PlayerShutdown(
            isAlive: { child.isAlive },
            terminate: { child.signal(.terminate) },
            forceKill: { child.signal(.kill) },
            now: { child.elapsed },
            pause: { child.advance() }
        )
        var reportedStillRunning = false
        do { try await shutdown.stop() }
        catch is PlayerShutdown.StillRunning { reportedStillRunning = true }
        catch { Issue.record("Unexpected cleanup failure: \(error)") }

        switch behavior {
        case .alreadyExited:
            #expect(child.signals == [])
            #expect(child.elapsed == .zero)
        case .exitsAfterTerminate:
            #expect(child.signals == [.terminate])
            #expect(child.elapsed == .seconds(1))
        case .ignoresTerminate:
            #expect(child.signals == [.terminate, .kill])
            #expect(child.elapsed == .seconds(5))
        case .ignoresBoth:
            #expect(child.signals == [.terminate, .kill])
            #expect(child.elapsed == .seconds(10))
        }
        #expect(reportedStillRunning == (behavior == .ignoresBoth))
        #expect(child.isAlive == (behavior == .ignoresBoth))
    }
}

enum ExitBehavior: CaseIterable, Sendable {

    case alreadyExited, exitsAfterTerminate, ignoresTerminate, ignoresBoth
}

private final class Child: Sendable {

    enum Signal { case terminate, kill }

    private struct State {
        var elapsed: Duration = .zero
        var signals: [Signal] = []
    }

    private let behavior: ExitBehavior
    private let state = Mutex(State())

    init(behavior: ExitBehavior) {

        self.behavior = behavior
    }

    var elapsed: Duration { state.withLock { $0.elapsed } }
    var signals: [Signal] { state.withLock { $0.signals } }

    var isAlive: Bool {

        state.withLock {
            switch behavior {
            case .alreadyExited: false
            case .exitsAfterTerminate: !$0.signals.contains(.terminate) || $0.elapsed < .seconds(1)
            case .ignoresTerminate: !$0.signals.contains(.kill)
            case .ignoresBoth: true
            }
        }
    }

    func signal(_ signal: Signal) {

        state.withLock { $0.signals.append(signal) }
    }

    func advance() {

        state.withLock { $0.elapsed += .seconds(1) }
    }
}
