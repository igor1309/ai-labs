import Calls
import CallsListUI
import Foundation
import Observation
import Recording
import Recordings

/// The app supplies a machine built on its observable model loop.
@MainActor
struct RecordingsInputs {
    let state: () -> RecordingsState
    let send: (RecordingsEvent) -> Void

    init(state: @escaping () -> RecordingsState, send: @escaping (RecordingsEvent) -> Void) {
        self.state = state; self.send = send
    }
}

@MainActor @Observable
public final class AudelinCalls {
    private let inputs: RecordingsInputs
    private let location: (String) async throws -> URL
    private let openFolder: (URL) -> Bool
    private let present: () -> Void
    private let timeZone: TimeZone
    private let recordingState: () -> RecordingState
    private var editing: CallsListState.Editing?
    private var openFailure: String?
    private var opening = false

    init(inputs: RecordingsInputs, timeZone: TimeZone, recordingState: @escaping () -> RecordingState,
         location: @escaping (String) async throws -> URL, openFolder: @escaping (URL) -> Bool,
         present: @escaping () -> Void) {
        self.inputs = inputs; self.timeZone = timeZone; self.recordingState = recordingState
        self.location = location; self.openFolder = openFolder; self.present = present
    }

    public var state: CallsListState {
        var state = callsListState(inputs.state(), timeZone: timeZone)
        state.editing = editing
        state.failure = openFailure ?? state.failure
        state.busy = state.busy || opening
        return state
    }

    public func show() {
        openFailure = nil
        editing = nil
        inputs.send(.refresh)
        present()
    }

    func recordingChanged(_ state: RecordingState) {
        let id = recordedCallID(state)
        if editing?.id == id { editing = nil }
        inputs.send(.recordingChanged(id))
    }

    public func send(_ event: CallsListEvent) async {
        guard !opening else { return }
        recordingChanged(recordingState())
        let snapshot = state
        switch event {
        case let .beginRename(id):
            guard !snapshot.busy, let row = snapshot.rows.first(where: { $0.id == id }), row.editable else { return }
            openFailure = nil
            inputs.send(.clearFailure)
            editing = .init(id: id, title: row.title)
        case let .editTitle(title): editing?.title = title
        case .cancelRename: editing = nil
        case .submitRename:
            guard let edit = editing else { return }
            editing = nil
            openFailure = nil
            inputs.send(.rename(id: edit.id, title: edit.title))
        case let .askDelete(id):
            editing = nil
            openFailure = nil
            inputs.send(.askDelete(id))
        case .confirmDelete:
            openFailure = nil
            inputs.send(.confirmDelete)
        case .cancelDelete: inputs.send(.cancelDelete)
        case let .open(id):
            guard !snapshot.busy else { return }
            editing = nil
            openFailure = nil
            inputs.send(.clearFailure)
            opening = true
            defer { opening = false }
            do {
                let url = try await location(id)
                if !openFolder(url) { openFailure = "Не удалось открыть «\(id)» в Finder." }
            } catch { openFailure = "«\(id)»: \(error.localizedDescription)" }
        }
    }
}

func recordedCallID(_ state: RecordingState) -> String? {
    state.phase == .idle ? nil : state.callID
}

func callsListState(_ state: RecordingsState, timeZone: TimeZone) -> CallsListState {
    let busy: Bool
    let deleteID: String?
    switch state.phase {
    case .idle: busy = false; deleteID = nil
    case let .askingDelete(id): busy = false; deleteID = id
    default: busy = true; deleteID = nil
    }
    return CallsListState(rows: state.calls.map {
        .init(id: $0.id, title: $0.title, start: $0.start, duration: $0.duration,
              timeZone: timeZone, editable: $0.id != state.recordingID)
    }, deleteID: deleteID, busy: busy || state.isListing, failure: state.failure.map { failure in
        (failure.id.map { "«\($0)»: " } ?? "") + failure.reason
    })
}
