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

/// The selected call's notes while the preview is open.
public struct CallsPreview: Equatable, Sendable {
    public enum Notes: Equatable, Sendable { case text(String), unreadable(String) }
    public let id: String
    public let title: String
    public let date: String
    public let duration: String
    public let notes: Notes

    public init(id: String, title: String, date: String, duration: String, notes: Notes) {
        self.id = id; self.title = title; self.date = date; self.duration = duration; self.notes = notes
    }
}

@MainActor @Observable
public final class AudelinCalls {
    /// The selected call's notes, while the preview is open and the call has them.
    public private(set) var preview: CallsPreview?
    private let notes: (String) async throws -> String?
    private let focusPreview: () -> Void
    private var selectedID: String?
    private var previewOpen = false
    private var withNotes: Set<String> = []
    private var notesScan: Task<Void, Never>?
    private var loading: Task<Void, Never>?

    private let retryableSummaries: () -> Set<String>
    private let retrySummary: (String) async throws -> Void
    private var retrying: Set<String> = []
    private let summaryStatuses: () -> [String: String]
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
         present: @escaping () -> Void, summaryStatuses: @escaping () -> [String: String] = { [:] },
         notes: @escaping (String) async throws -> String? = { _ in nil },
         focusPreview: @escaping () -> Void = {},
         retryableSummaries: @escaping () -> Set<String> = { [] },
         retrySummary: @escaping (String) async throws -> Void = { _ in throw CocoaError(.fileWriteUnknown) }) {
        self.retryableSummaries = retryableSummaries
        self.retrySummary = retrySummary
        self.focusPreview = focusPreview
        self.summaryStatuses = summaryStatuses
        self.notes = notes
        self.inputs = inputs; self.timeZone = timeZone; self.recordingState = recordingState
        self.location = location; self.openFolder = openFolder; self.present = present
    }

    public var state: CallsListState {
        var state = callsListState(inputs.state(), timeZone: timeZone)
        let statuses = summaryStatuses()
        let retryable = retryableSummaries().subtracting(retrying)
        for index in state.rows.indices {
            state.rows[index].summaryStatus = statuses[state.rows[index].id] ?? ""
            state.rows[index].canRetrySummary = retryable.contains(state.rows[index].id)
            state.rows[index].hasNotes = withNotes.contains(state.rows[index].id)
        }
        state.selectedID = selectedID
        state.previewedID = preview?.id
        state.editing = editing
        state.failure = openFailure ?? state.failure
        state.busy = state.busy || opening
        return state
    }

    var recordingsState: RecordingsState { inputs.state() }
    /// No folder move, delete or rename is under way or waiting on an answer.
    var idle: Bool { inputs.state().phase == .idle && editing == nil && !opening }
    func sendRecordings(_ event: RecordingsEvent) {
        recordingChanged(recordingState())
        inputs.send(event)
    }
    func drainMove() async {
        inputs.send(.stopActions)
        for await state in Observations({ self.inputs.state() }) where state.stopping && state.callsFolderAvailable { return }
    }

    public func show() {
        openFailure = nil
        editing = nil
        inputs.send(.refresh)
        present()
        scanNotes()
    }

    /// The preview's own close; only an eye opens it again.
    public func closePreview() {
        previewOpen = false
        updatePreview()
    }

    /// With the calls window closed the preview has no row to follow.
    public func windowClosed() {
        notesScan?.cancel()
        notesScan = nil
        closePreview()
    }

    /// Finds which listed calls have notes as the listing or summary status changes
    /// while the window is shown; notes that are there but unreadable count, so their
    /// reason can be shown.
    private func scanNotes() {
        notesScan?.cancel()
        notesScan = Task { [notes] in
            for await (ids, _) in Observations({ (self.inputs.state().calls.map(\.id), self.summaryStatuses()) }) {
                var found = Set<String>()
                for id in ids {
                    do { if try await notes(id) != nil { found.insert(id) } } catch { found.insert(id) }
                }
                if Task.isCancelled { return }
                withNotes = found
                // The open preview follows what the reload found.
                updatePreview()
            }
        }
    }

    private func updatePreview() {
        loading?.cancel()
        guard previewOpen, let id = selectedID, let row = state.rows.first(where: { $0.id == id }) else {
            loading = nil
            preview = nil
            return
        }
        loading = Task { [notes] in
            let read: CallsPreview.Notes?
            do { read = try await notes(id).map { .text($0) } } catch { read = .unreadable(error.localizedDescription) }
            guard !Task.isCancelled else { return }
            preview = read.map { .init(id: id, title: row.displayTitle, date: row.date, duration: row.duration, notes: $0) }
        }
    }

    private func move(by step: Int, in rows: [CallsListState.Row]) {
        guard !rows.isEmpty else { return }
        let index = selectedID.flatMap { id in rows.firstIndex { $0.id == id } }
        let next = index.map { min(max($0 + step, 0), rows.count - 1) } ?? (step > 0 ? 0 : rows.count - 1)
        selectedID = rows[next].id
        updatePreview()
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
        case let .select(id):
            selectedID = id
            updatePreview()
        case .selectNext: move(by: 1, in: snapshot.rows)
        case .selectPrevious: move(by: -1, in: snapshot.rows)
        case let .preview(id):
            // An eye asks for the panel to be the active window; a row
            // selection only moves its content.
            focusPreview()
            selectedID = id
            previewOpen = true
            updatePreview()
        case let .retrySummary(id):
            guard !snapshot.busy, let row = snapshot.rows.first(where: { $0.id == id }),
                  row.editable, row.canRetrySummary else { return }
            retrying.insert(id)
            defer { retrying.remove(id) }
            openFailure = nil
            inputs.send(.clearFailure)
            do { try await retrySummary(id) }
            catch { openFailure = "Не удалось повторить подготовку итогов. Расшифровка и прежние итоги сохранены." }
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
    state.phase == .idle ? nil : (state.callID ?? "")
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
