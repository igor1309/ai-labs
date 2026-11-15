import MenuBar
import Observation

/// Composes the PanelPresence machine from its reducer and effect handler. Events reduce
/// before `event(_:)` returns, so the menu reads the presence every event before it left.
@MainActor @Observable
final class PanelPresenceModel {

    private(set) var state = PanelPresence()
    @ObservationIgnored private let handler: PanelPresenceEffectHandler

    init(handler: PanelPresenceEffectHandler) { self.handler = handler }

    func event(_ event: PanelPresence.Event) {
        let (next, effects) = PanelPresence.reduce(state, event)
        state = next
        for effect in effects {
            handler.handle(effect) { [weak self] in self?.event($0) }
        }
    }

    /// Recording's output, as the recording the panel follows.
    func recordingChanged(_ id: UInt64?) { event(.recordingChanged(id)) }

    isolated deinit { handler.cancel() }
}
