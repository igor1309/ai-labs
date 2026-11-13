import Foundation
import CallNotes
import IMRxObservation

/// The root connects the call's reducer to the job adapter's callback lifetime.
@MainActor
final class CallNotesModel {
    private var model: ObservableModel<CallNotesState, CallNotesEvent, CallNotesEffect>!
    private var output: AsyncStream<CallNotesEvent>.Continuation?
    init(initial: CallNotesState, date: @escaping @Sendable (Date) -> String, handler: CallNotesEffectHandler) {
        let reducer = CallNotesReducer(date: date)
        model = ObservableModel(initialState: initial, reduce: reducer.reduce, handleEffect: { [weak self] effect in
            AsyncStream { output in
                guard let self else { output.finish(); return }
                if effect == .load { self.output = output }
                else { self.close() }
                handler.handleEffect(effect) { output.yield($0); output.finish() }
                if effect == .cancel { output.finish() }
            }
        })
    }
    deinit { output?.finish() }
    func close() { output?.finish(); output = nil }
    var state: CallNotesState { model.state }
    func send(_ event: CallNotesEvent) { model.event(event) }
}
