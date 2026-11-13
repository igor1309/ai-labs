import SettingsUI
import Calls
import CallNotes
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

/// The selected call as the detail shows it.
public struct CallsDetail: Equatable, Sendable {
    public enum Content: Equatable, Sendable {
        /// The notes' Markdown source.
        case notes(String, made: String? = nil)
        /// Why the notes cannot be read.
        case unreadable(String)
        case preparing
        /// Preparing the summary failed; `canRetry` when Повторить итоги is offered.
        case failed(reason: String, canRetry: Bool)
        /// No summary.
        case none
    }
    public let id: String
    public let title: String
    public let date: String
    public let duration: String
    public let content: Content

    public init(id: String, title: String, date: String, duration: String, content: Content) {
        self.id = id; self.title = title; self.date = date; self.duration = duration; self.content = content
    }
}

/// What the detail asks of the call it shows.
public enum CallsDetailEvent: Equatable, Sendable { case copy, open, rename, makeSummary, cancelSummary, retrySummary, delete }

@MainActor @Observable
public final class AudelinCalls {
    /// The selected call, nil when none is selected.
    public private(set) var detail: CallsDetail?
    /// The call the detail was last read for: the selection as the list showed it then.
    @ObservationIgnored private var detailFor: String?
    private let copy: (String) -> Void
    private let readCall: () -> Void
    /// The window is too narrow for the call beside the list.
    private var narrow = false
    private let notes: (String) async throws -> (text: String, made: String?)?
    private let notesState: (String) -> CallNotesState?
    private let makeSummary: (String) -> Void
    private let cancelSummary: (String) async -> Void
    private var selectedID: String?
    private var withNotes: Set<String> = []
    /// Each call's gist, read with its notes.
    private var gists: [String: String] = [:]
    private var notesScan: Task<Void, Never>?
    private var loading: Task<Void, Never>?

    private let retryableSummaries: () -> Set<String>
    private let retrySummary: (String) async throws -> Void
    private var retrying: Set<String> = []
    private let summaryStatuses: () -> [String: String]
    private let summaryBadges: () -> [String: CallsListState.Row.Summary]
    private let inputs: RecordingsInputs
    private let location: (String) async throws -> URL
    private let openFolder: (URL) -> Bool
    private let present: () -> Void
    private let timeZone: TimeZone
    private let now: () -> Date
    private let recordingState: () -> RecordingState
    private var editing: CallsListState.Editing?
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
         notesState: @escaping (String) -> CallNotesState? = { _ in nil },
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
        self.notesState = notesState; self.makeSummary = makeSummary; self.cancelSummary = cancelSummary
        self.summaryStatuses = summaryStatuses
        self.summaryBadges = summaryBadges
        self.notes = notes
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
        let retryable = retryableSummaries().subtracting(retrying)
        for index in state.rows.indices {
            state.rows[index].summaryStatus = statuses[state.rows[index].id] ?? ""
            state.rows[index].summary = badges[state.rows[index].id] ?? .none
            state.rows[index].canRetrySummary = retryable.contains(state.rows[index].id)
            state.rows[index].hasNotes = withNotes.contains(state.rows[index].id)
            let machine = notesState(state.rows[index].id)
            state.rows[index].canMakeSummary = state.rows[index].editable && !state.rows[index].hasNotes
                && state.rows[index].summary == .none && (machine == nil || machine == .pending)
            state.rows[index].gist = gists[state.rows[index].id]
            state.rows[index].match = found[state.rows[index].id]
        }
        state.selectedID = state.rows.contains { $0.id == selectedID } ? selectedID : nil
        state.narrow = narrow
        state.editing = editing
        state.failure = openFailure ?? state.failure
        state.busy = state.busy || opening
        return state
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
        query = text
        textMatches = [:]
        defer { followSelection() }
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
                textMatches[id] = .some(match?.snippet)
                followSelection()
            }
            searching = false
        }
    }

    /// Shows the list in the new language at once.
    func languageChanged(_ text: CallsListText) { listText = text }

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
        search(query)
        openFailure = nil
        editing = nil
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
            for await (ids, _, _) in Observations({
                let ids = self.inputs.state().calls.map(\.id)
                return (ids, self.summaryStatuses(), ids.map(self.notesState))
            }) {
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
                // The detail follows what the reload found.
                updateDetail()
            }
        }
    }

    /// A search that hides or shows the selected call empties or refills the detail.
    private func followSelection() {
        if state.selectedID != detailFor { updateDetail() }
    }

    /// Reads the selected call's notes into the detail.
    private func updateDetail() {
        loading?.cancel()
        let state = state
        detailFor = state.selectedID
        guard let id = selectedID, let index = state.rows.firstIndex(where: { $0.id == id }) else {
            loading = nil
            detail = nil
            return
        }
        let row = state.rows[index]
        let opening = state.rows[...index].last(where: { $0.day != nil })?.day
        let date = [opening?.title, row.time].compactMap { $0 }.joined(separator: ", ")
        let status = summaryStatuses()[id] ?? ""
        loading = Task { [notes] in
            let read: CallsDetail.Content?
            do { read = try await notes(id).map { .notes($0.text, made: $0.made) } } catch { read = .unreadable(error.localizedDescription) }
            guard !Task.isCancelled else { return }
            let content: CallsDetail.Content
            switch (read, notesState(id), row.summary) {
            case let (read?, _, _): content = read
            case (nil, .loading?, _): content = .preparing
            case let (nil, .failure(failure)?, _): content = .failed(reason: failure.reason, canRetry: row.canRetrySummary && row.editable)
            case (nil, _, .pending): content = .preparing
            case (nil, _, .failed): content = .failed(reason: status, canRetry: row.canRetrySummary && row.editable)
            case (nil, _, .none): content = .none
            }
            detail = .init(id: id, title: row.displayTitle, date: date, duration: row.duration, content: content)
        }
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

    private func move(by step: Int, in rows: [CallsListState.Row]) {
        guard !rows.isEmpty else { return }
        let index = selectedID.flatMap { id in rows.firstIndex { $0.id == id } }
        let next = index.map { min(max($0 + step, 0), rows.count - 1) } ?? (step > 0 ? 0 : rows.count - 1)
        selectedID = rows[next].id
        updateDetail()
    }

    /// Ends an inline rename by saving its title, as leaving the field does in Finder.
    private func commitRename() {
        guard let edit = editing else { return }
        editing = nil
        openFailure = nil
        inputs.send(.rename(id: edit.id, title: edit.title))
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
        case .submitRename: commitRename()
        case let .askDelete(id):
            editing = nil
            openFailure = nil
            inputs.send(.askDelete(id))
        case .confirmDelete:
            openFailure = nil
            inputs.send(.confirmDelete)
        case .cancelDelete: inputs.send(.cancelDelete)
        case let .select(id):
            if editing?.id != id { commitRename() }
            selectedID = id
            updateDetail()
        case let .search(text): search(text)
        case .selectNext: commitRename(); move(by: 1, in: snapshot.rows)
        case .selectPrevious: commitRename(); move(by: -1, in: snapshot.rows)
        case let .read(id):
            guard snapshot.rows.contains(where: { $0.id == id }) else { return }
            if editing?.id != id { commitRename() }
            selectedID = id
            updateDetail()
            // The call's window opens on this call's detail, not the one shown before.
            // A reload may replace the load meanwhile; wait for the one that stands.
            while let current = loading {
                await current.value
                if loading == current { break }
            }
            guard selectedID == id, detail?.id == id else { return }
            readCall()
        case let .makeSummary(id):
            guard !snapshot.busy, let row = snapshot.rows.first(where: { $0.id == id }), row.canMakeSummary else { return }
            makeSummary(id)
        case let .retrySummary(id):
            guard !snapshot.busy, let row = snapshot.rows.first(where: { $0.id == id }),
                  row.editable, row.canRetrySummary else { return }
            retrying.insert(id)
            defer { retrying.remove(id) }
            openFailure = nil
            inputs.send(.clearFailure)
            do { try await retrySummary(id) }
            catch { openFailure = listText(.summaryRetryFailed) }
        case let .open(id):
            guard !snapshot.busy else { return }
            editing = nil
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
