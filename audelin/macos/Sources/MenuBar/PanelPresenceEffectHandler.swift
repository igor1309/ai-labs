/// Carries out PanelPresence's effects: shows and hides the panel, opens the calls list,
/// and owns the one pending hide delay, which `sleep` times.
@MainActor
public final class PanelPresenceEffectHandler {

    private let present: (Bool, PanelPresence.Reason) -> Void
    private let showCalls: () -> Void
    private let sleep: @Sendable (Duration) async throws -> Void
    private var delay: Task<Void, Never>?

    /// `present` shows (`true`) or hides the panel for a reason; `sleep` waits out a hide delay.
    public init(present: @escaping (Bool, PanelPresence.Reason) -> Void, showCalls: @escaping () -> Void,
                sleep: @escaping @Sendable (Duration) async throws -> Void) {
        self.present = present
        self.showCalls = showCalls
        self.sleep = sleep
    }

    /// Carries out one reduction's effects in order. The stream delivers `.delayElapsed` when a
    /// delay elapses uncancelled, and finishes with no event otherwise.
    public func handle(_ effects: [PanelPresence.Effect]) -> AsyncStream<PanelPresence.Event> {
        let (events, output) = AsyncStream.makeStream(of: PanelPresence.Event.self)
        var waiting = false
        for effect in effects {
            switch effect {
            case let .show(reason): present(true, reason)
            case let .hide(reason): present(false, reason)
            case .showCalls: showCalls()
            case .cancelDelay: cancel()
            case let .hideAfter(seconds, generation):
                delay?.cancel()
                waiting = true
                delay = Task { [sleep] in
                    defer { output.finish() }
                    do { try await sleep(.seconds(seconds)) } catch { return }
                    guard !Task.isCancelled else { return }
                    output.yield(.delayElapsed(generation))
                }
            }
        }
        if !waiting { output.finish() }
        return events
    }

    /// Drops the pending delay, if any, without delivering its event.
    public func cancel() {
        delay?.cancel()
        delay = nil
    }

    isolated deinit { delay?.cancel() }
}
