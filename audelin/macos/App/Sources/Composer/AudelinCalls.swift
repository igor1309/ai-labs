import CallDetail
import IMRxObservation
import SettingsUI
import Calls
import CallsList
import CallsListUI
import CallsSearch
import Foundation
import NotesMarkdown
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

/// What the detail asks of the call it shows.
public enum CallsDetailEvent: Equatable, Sendable { case copy, open, rename, makeSummary, cancelSummary, retrySummary, delete }

@MainActor @Observable
public final class AudelinCalls {
    /// The selected call, nil when none is selected.
    public var detail: CallsDetail? { detailModel.state.detail }
    private let detailModel: ObservableModel<CallDetailState, CallDetailEvent, CallDetailEffect>
    private let copy: (String) -> Void
    private let readCall: () -> Void
    /// The window is too narrow for the call beside the list.
    private var narrow = false
    private let notes: (String) async throws -> (text: String, made: String?)?
    private let makeSummary: (String) -> Void
    private let cancelSummary: (String) async -> Void
    /// The list's selection and rename editing.
    private let list = SyncModel<CallsListMachineState, CallsListMachineEvent>(initialState: .init(), reduce: CallsListReducer().reduce)
    private var withNotes: Set<String> = []
    /// Each call's gist, read with its notes.
    private var gists: [String: String] = [:]
    private var notesScan: Task<Void, Never>?

    private let retryableSummaries: () -> Set<String>
    private let retrySummary: (String) async throws -> Void
    private let summaryStatuses: () -> [String: String]
    private let summaryBadges: () -> [String: CallsListState.Row.Summary]
    private let inputs: RecordingsInputs
    private let location: (String) async throws -> URL
    private let openFolder: (URL) -> Bool
    private let present: () -> Void
    private let timeZone: TimeZone
    private let now: () -> Date
    private let recordingState: () -> RecordingState
    private var openFailure: String?
    private var opening = false
    private let describe: (any Error) -> String
    /// The calls list's text, in the language Audelin is shown in.
    public private(set) var listText: CallsListText
    private let callText: (String) async throws -> Calls.Text
    private var query = ""
    /// Each read call's transcript or notes match, nil when they hold none; a call
    /// not yet read is absent. Titles are matched afresh, so a rename shows at once.
    private var textMatches: [String: CallsSearch.Snippet?] = [:]
    private var searching = false
    private var searchTask: Task<Void, Never>?

    init(inputs: RecordingsInputs, timeZone: TimeZone, now: @escaping () -> Date, recordingState: @escaping () -> RecordingState,
         location: @escaping (String) async throws -> URL, openFolder: @escaping (URL) -> Bool,
         present: @escaping () -> Void, summaryStatuses: @escaping () -> [String: String] = { [:] },
         summaryBadges: @escaping () -> [String: CallsListState.Row.Summary] = { [:] },
         notes: @escaping (String) async throws -> (text: String, made: String?)? = { _ in nil },
         makeSummary: @escaping (String) -> Void = { _ in },
         cancelSummary: @escaping (String) async -> Void = { _ in },
         copy: @escaping (String) -> Void = { _ in },
         readCall: @escaping () -> Void = {},
         retryableSummaries: @escaping () -> Set<String> = { [] },
         retrySummary: @escaping (String) async throws -> Void = { _ in throw CocoaError(.fileWriteUnknown) },
         describe: @escaping (any Error) -> String = SettingsText(language: .russian).callsFailure,
         listText: CallsListText = .init(language: .russian),
         callText: @escaping (String) async throws -> Calls.Text = { _ in .init(notes: nil, transcript: []) }) {
        self.callText = callText
        self.describe = describe
        self.listText = listText
        self.retryableSummaries = retryableSummaries
        self.retrySummary = retrySummary
        self.copy = copy
        self.readCall = readCall
        self.makeSummary = makeSummary; self.cancelSummary = cancelSummary
        self.summaryStatuses = summaryStatuses
        self.summaryBadges = summaryBadges
        self.notes = notes
        let handler = CallDetailEffectHandler(notes: { @MainActor id in try await notes(id) })
        detailModel = ObservableModel(initialState: .init(), reduce: CallDetailReducer().reduce,
                                      handleEffect: { effect in oneEvent { await handler.handle(effect) } })
        self.inputs = inputs; self.timeZone = timeZone; self.now = now; self.recordingState = recordingState
        self.location = location; self.openFolder = openFolder; self.present = present
    }

    public var state: CallsListState {
        var recordings = inputs.state()
        var found: [String: CallsListState.Row.Match] = [:]
        let searchOn = !query.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
        if searchOn {
            for call in recordings.calls {
                let title = CallsSearch.match(query, title: call.title, transcript: [], notes: nil)?.title ?? []
                let snippet = textMatches[call.id] ?? nil
                guard !title.isEmpty || snippet != nil else { continue }
                found[call.id] = .init(title: title, snippet: snippet.map(rowSnippet))
            }
            recordings.calls = recordings.calls.filter { found[$0.id] != nil }
        }
        var state = callsListState(recordings, timeZone: timeZone, now: now(), text: listText)
        state.searchText = query
        state.search = searchOn ? .init(query: query, searching: searching) : nil
        let statuses = summaryStatuses()
        let badges = summaryBadges()
        let retryable = retryableSummaries().subtracting(list.state.retrying)
        for index in state.rows.indices {
            state.rows[index].summaryStatus = statuses[state.rows[index].id] ?? ""
            state.rows[index].summary = badges[state.rows[index].id] ?? .none
            state.rows[index].canRetrySummary = retryable.contains(state.rows[index].id)
            state.rows[index].hasNotes = withNotes.contains(state.rows[index].id)
            state.rows[index].canMakeSummary = state.rows[index].editable && !state.rows[index].hasNotes
                && state.rows[index].summary == .none
            state.rows[index].gist = gists[state.rows[index].id]
            state.rows[index].match = found[state.rows[index].id]
        }
        let selectedID = list.state.selectedID
        state.selectedID = state.rows.contains { $0.id == selectedID } ? selectedID : nil
        state.narrow = narrow
        state.editing = list.state.editing.map { .init(id: $0.id, title: $0.title) }
        state.failure = openFailure ?? list.state.failure.map(failureText) ?? state.failure
        state.busy = state.busy || opening
        return state
    }

    private func failureText(_ failure: CallsListMachineState.Failure) -> String {
        switch failure {
        case .retryFailed: listText(.summaryRetryFailed)
        }
    }

    private func rowSnippet(_ snippet: CallsSearch.Snippet) -> CallsListState.Row.Match.Snippet {
        let place: String, isTime: Bool
        switch snippet.place {
        case .notes: place = listText(.searchNotes); isTime = false
        case let .transcript(seconds):
            let whole = Int(seconds)
            place = whole >= 3_600 ? String(format: "%d:%02d:%02d", whole / 3_600, whole / 60 % 60, whole % 60)
                                   : String(format: "%02d:%02d", whole / 60, whole % 60)
            isTime = true
        }
        return .init(place: place, placeIsTime: isTime, text: snippet.text, hits: snippet.hits,
                     more: snippet.more > 0 ? listText(.searchMore, snippet.more) : nil)
    }

    /// Reads each listed call's transcript and notes once for the query; a newer query
    /// cancels the older reading. Rows join as their calls are read.
    private func search(_ text: String) {
        searchTask?.cancel()
        let previousSelection = state.selectedID
        query = text
        textMatches = [:]
        defer { followSelection(previousSelection) }
        guard !text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else {
            searching = false
            searchTask = nil
            return
        }
        searching = true
        let ids = inputs.state().calls.map(\.id)
        searchTask = Task { [callText] in
            for id in ids {
                let read = try? await callText(id)
                guard !Task.isCancelled else { return }
                let match = read.flatMap { read in
                    CallsSearch.match(text, title: "", transcript: read.transcript.map { .init(start: $0.start, words: $0.words) }, notes: read.notes)
                }
                let previousSelection = state.selectedID
                textMatches[id] = .some(match?.snippet)
                followSelection(previousSelection)
            }
            searching = false
        }
    }

    /// Shows the list in the new language at once.
    func languageChanged(_ text: CallsListText) { listText = text }

    var recordingsState: RecordingsState { inputs.state() }
    /// No folder move, delete or rename is under way or waiting on an answer.
    var idle: Bool { inputs.state().phase == .idle && list.state.editing == nil && !opening }
    func sendRecordings(_ event: RecordingsEvent) {
        recordingChanged(recordingState())
        inputs.send(event)
    }
    func drainMove() async {
        inputs.send(.stopActions)
        for await state in Observations({ self.inputs.state() }) where state.stopped { return }
    }

    public func show() {
        search(query)
        openFailure = nil
        list.event(.shown)
        inputs.send(.refresh)
        present()
        scanNotes()
    }

    /// The calls window became narrow or wide: below the width for the call beside the list,
    /// Return and Space read the selected call in its own window.
    public func widthChanged(narrow: Bool) {
        self.narrow = narrow
    }

    /// With the calls window closed the list stops looking for notes.
    public func windowClosed() {
        notesScan?.cancel()
        notesScan = nil
    }

    /// Finds which listed calls have notes, and each one's gist, as the listing or summary status changes
    /// while the window is shown; notes that are there but unreadable count, so their
    /// reason can be shown.
    private func scanNotes() {
        notesScan?.cancel()
        notesScan = Task { [notes] in
            for await (ids, _, _, _) in Observations({
                (self.inputs.state().calls.map(\.id), self.summaryStatuses(), self.summaryBadges(), self.retryableSummaries())
            }) {
                connectDetailInputs()
                var found = Set<String>(), gists: [String: String] = [:]
                for id in ids {
                    // A closed window stops the scan between reads.
                    guard !Task.isCancelled else { return }
                    do {
                        guard let text = try await notes(id) else { continue }
                        found.insert(id)
                        gists[id] = NotesMarkdown.gist(text.text)
                    } catch { found.insert(id) }
                }
                if Task.isCancelled { return }
                withNotes = found
                self.gists = gists
                if let id = state.selectedID { detailModel.event(.notesChanged(id: id)) }
            }
        }
    }

    /// A search can hide or restore the selected call while its text is being read.
    private func followSelection(_ previous: String?) {
        if state.selectedID != previous { selectDetail() }
    }

    private func selectDetail() { detailModel.event(.selectionChanged(detailSelection())) }

    /// Maps the list's display values into the detail's input contract.
    private func detailSelection() -> CallDetailState.Call? {
        let state = state
        guard let id = state.selectedID, let index = state.rows.firstIndex(where: { $0.id == id }) else { return nil }
        let row = state.rows[index]
        let opening = state.rows[...index].last(where: { $0.day != nil })?.day
        let date = [opening?.title, row.time].compactMap { $0 }.joined(separator: ", ")
        let badge: CallDetailState.Call.Summary.Badge
        switch row.summary {
        case .none: badge = .none
        case .pending: badge = .pending
        case .failed: badge = .failed
        }
        return .init(id: id, title: row.displayTitle, date: date, duration: row.duration, editable: row.editable,
                     summary: .init(badge: badge, status: row.summaryStatus, canRetry: row.canRetrySummary))
    }

    /// Connects summary updates separately from changes to the selected call's display fields.
    private func connectDetailInputs() {
        let call = detailSelection()
        if var previous = detailModel.state.selected, let call, previous.id == call.id {
            previous.summary = call.summary
            if previous == call { detailModel.event(.summaryChanged(id: call.id, summary: call.summary)) }
            else { detailModel.event(.selectionChanged(call)) }
        } else { detailModel.event(.selectionChanged(call)) }
    }

    /// The detail's buttons and menu act on the call it shows, as the list's own actions do.
    public func send(detail event: CallsDetailEvent) async {
        guard let shown = detail else { return }
        switch event {
        case .copy: if case let .notes(source, _) = shown.content { copy(source) }
        case .open: await send(.open(shown.id))
        case .rename: await send(.beginRename(shown.id))
        case .makeSummary: await send(.makeSummary(shown.id))
        case .cancelSummary: await cancelSummary(shown.id)
        case .retrySummary: await send(.retrySummary(shown.id))
        case .delete: await send(.askDelete(shown.id))
        }
    }

    /// Sends the list an event and passes each request it makes on to Recordings.
    private func sendList(_ event: CallsListMachineEvent) async {
        let asked = list.state.asked
        list.event(event)
        guard list.state.asked > asked else { return }
        openFailure = nil
        for request in list.state.requests {
            switch request {
            case let .rename(id, title): inputs.send(.rename(id: id, title: title))
            case .clearFailure: inputs.send(.clearFailure)
            case let .retrySummary(id):
                let succeeded: Bool
                do { try await retrySummary(id); succeeded = true } catch { succeeded = false }
                await sendList(.retryFinished(id, succeeded: succeeded))
            }
        }
    }

    func recordingChanged(_ state: RecordingState) {
        let id = recordedCallID(state)
        list.event(.recordingChanged(id: id))
        inputs.send(.recordingChanged(id))
    }

    public func send(_ event: CallsListEvent) async {
        guard !opening else { return }
        recordingChanged(recordingState())
        let snapshot = state
        await sendList(.rowsChanged(snapshot.rows.map { .init(id: $0.id, title: $0.title, editable: $0.editable, canRetry: $0.canRetrySummary) },
                                     busy: snapshot.busy))
        switch event {
        case let .beginRename(id): await sendList(.beginRename(id))
        case let .editTitle(title): await sendList(.editTitle(title))
        case .cancelRename: await sendList(.cancelRename)
        case .submitRename: await sendList(.submitRename)
        case let .askDelete(id):
            await sendList(.askDelete(id))
            openFailure = nil
            inputs.send(.askDelete(id))
        case .confirmDelete:
            await sendList(.confirmDelete)
            openFailure = nil
            inputs.send(.confirmDelete)
        case .cancelDelete: inputs.send(.cancelDelete)
        case let .select(id):
            await sendList(.select(id))
            selectDetail()
        case let .search(text): search(text)
        case .selectNext:
            await sendList(.selectNext)
            followSelection(snapshot.selectedID)
        case .selectPrevious:
            await sendList(.selectPrevious)
            followSelection(snapshot.selectedID)
        case let .read(id):
            guard snapshot.rows.contains(where: { $0.id == id }) else { return }
            await sendList(.select(id))
            let revision = detailModel.state.revision
            selectDetail()
            // The selection event is asynchronous; open only after its latest read has answered.
            for await (detailState, visibleID) in Observations({ (self.detailModel.state, self.state.selectedID) }) {
                guard visibleID == id else { return }
                if detailState.revision > revision, detailState.selected?.id == id, detailState.notes != .notRead { break }
            }
            guard list.state.selectedID == id, detail?.id == id else { return }
            readCall()
        case let .makeSummary(id):
            guard !snapshot.busy, let row = snapshot.rows.first(where: { $0.id == id }), row.canMakeSummary else { return }
            makeSummary(id)
        case let .retrySummary(id):
            await sendList(.retry(id))
        case let .open(id):
            guard !snapshot.busy else { return }
            await sendList(.cancelRename)
            await sendList(.dismissFailure)
            openFailure = nil
            inputs.send(.clearFailure)
            opening = true
            defer { opening = false }
            do {
                let url = try await location(id)
                if !openFolder(url) { openFailure = listText(.openFailed, id) }
            } catch { openFailure = "«\(id)»: \(describe(error))" }
        }
    }
}

func recordedCallID(_ state: RecordingState) -> String? {
    state.phase == .idle ? nil : (state.callID ?? "")
}

/// Calls arrive newest first; each day's first row carries the day's header.
func callsListState(_ state: RecordingsState, timeZone: TimeZone, now: Date, text: CallsListText) -> CallsListState {
    let busy: Bool
    let deleteID: String?
    switch state.phase {
    case .idle: busy = false; deleteID = nil
    case let .askingDelete(id): busy = false; deleteID = id
    default: busy = true; deleteID = nil
    }
    let format = CallsListFormat(timeZone: timeZone, text: text)
    let days = state.calls.map { format.day($0.start, now: now) }
    return CallsListState(rows: state.calls.indices.map { index in
        let call = state.calls[index], day = days[index]
        let opens = index == 0 || days[index - 1] != day
        return .init(id: call.id, title: call.title, displayTitle: call.title.isEmpty ? format.stamp(call.start) : call.title,
                     day: opens ? .init(title: day, count: format.count(days[index...].prefix { $0 == day }.count)) : nil,
                     time: format.time(call.start), duration: format.duration(call.duration), editable: call.id != state.recordingID)
    }, deleteID: deleteID, deleteBody: state.calls.first { $0.id == deleteID }.map { call in
        text(.deleteBody, call.id + (call.title.isEmpty ? "" : " " + call.title))
    }, busy: busy || state.isListing, failure: state.failure.map { failure in
        (failure.id.map { "«\($0)»: " } ?? "") + failure.reason
    })
}
