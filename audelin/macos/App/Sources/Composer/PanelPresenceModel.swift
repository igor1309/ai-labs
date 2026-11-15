import IMRxObservation
import MenuBar

/// The panel-presence machine: the tested reducer and effect handler, composed as an async model.
@MainActor
func makePanelPresence(handler: PanelPresenceEffectHandler) -> ObservableModel<PanelPresence, PanelPresence.Event, [PanelPresence.Effect]> {

    ObservableModel(initialState: PanelPresence(), reduce: { state, event in
        let (next, effects) = PanelPresence.reduce(state, event)
        return (next, effects.isEmpty ? nil : effects)
    }, handleEffect: handler.handle)
}
