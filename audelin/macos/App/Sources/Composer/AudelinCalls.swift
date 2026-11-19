import CallDetail
import NotesMenu
import SummaryPreviewUI
import IMRxObservation
import SettingsUI
import Calls
import CallsList
import CallsListUI
import CallsSearch
import CallTags
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
public enum CallsDetailEvent: Equatable, Sendable {
    case notesMenuOpened, chooseNotesTemplate(String), toggleKeeping, openTemplatesFolder, chooseNotesVersion(CallNotesVersion), cancelNotes
    case makeSummaryWithTemplate(String)
    case copy, open, rename, makeSummary, cancelSummary, retrySummary, delete
    /// The tags line: open the field, type, take the completion, remove a chip, save, cancel.
    case editTags, typeTag(String), completeTag, removeTag(String), submitTags, cancelTags
}

/// The detail header's tags line for the call shown.
public enum CallsDetailTags: Equatable, Sendable {
    case shown([String])
    /// The field: its chips, the tag being typed, the rest of a tag in use it starts, a save
    /// under way and why the last save failed.
    case editing(tags: [String], entry: String, completion: String, saving: Bool, failure: String?)
}

@MainActor @Observable
public final class AudelinCalls {
    /// The selected call, nil when none is selected.
    public var detail: CallsDetail? { detailModel.state.detail }
    public var notesMenu: NotesMenuState { menuModel.state }
    private let menuModel: ObservableModel<NotesMenuState, NotesMenuEvent, NotesMenuEffect>
    private var notesConnections: [Task<Void, Never>] = []
    private let detailModel: ObservableModel<CallDetailState, CallDetailEvent, CallDetailEffect>
    private let copy: (String) -> Void
    private let readCall: () -> Void
    /// The window is too narrow for the call beside the list.
    private var narrow = false
    private let notes: (String) async throws -> CallNotesPair?
    private let makeWithTemplate: (String, String) -> Void
    private let saveKeeping: (Bool) throws -> Void
    private let readKeeping: () -> Bool
    public var keepPreviousNotes: Bool { readKeeping() }
    public func setKeepPreviousNotes(_ keeping: Bool) throws { try saveKeeping(keeping) }
    private let makeSummary: (String) -> Void
    private let cancelSummary: (String) async -> Void
    /// The list's selection and rename editing.
    private let list = SyncModel<CallsListMachineState, CallsListMachineEvent>(initialState: .init(), reduce: CallsListReducer(splitQuery: { let query = CallTags.query($0); return (query.tags, query.text) }, tagKey: CallTags.key, normalizeTags: CallTags.normalized, complete: { CallTags.completion(of: $0, draft: $1, inUse: $2) }).reduce)
    private var withNotes: Set<String> = []
    /// Each call's gist, read with its notes.
    private var gists: [String: String] = [:]
    private var notesScan: Task<Void, Never>?
    private var mergeFollow: Task<Void, Never>?

    private let retryableSummaries: () -> Set<String>
    private let retrySummary: (String) async throws -> Void
    private let summaryStatuses: () -> [String: String]
    private let summaryTemplates: () -> [String: String]
    private let summaryFailures: () -> [String: CallDetailFailure]
    private let summaryBadges: () -> [String: CallsListState.Row.Summary]
    private let inputs: RecordingsInputs
    private let location: (String) async throws -> URL
    private let openFolder: (URL) -> Bool
    private let present: () -> Void
    private let timeZone: TimeZone
    private let now: () -> Date
    private let recordingState: () -> RecordingState
    private let describe: (any Error) -> String
    /// The calls list's text, in the language Audelin is shown in.
    public private(set) var listText: CallsListText
    private let callText: (String) async throws -> CallsText
    /// The tag being typed in the detail's tags field; it joins the draft on Return.
    private var tagsFollow: Task<Void, Never>?
    /// Each read call's transcript or notes match, nil when they hold none; a call
    /// not yet read is absent. Titles are matched afresh, so a rename shows at once.
    private var textMatches: [String: CallsSearch.Snippet?] = [:]
    private var searching = false
    private var searchTask: Task<Void, Never>?

    init(inputs: RecordingsInputs, timeZone: TimeZone, now: @escaping () -> Date, recordingState: @escaping () -> RecordingState,
         location: @escaping (String) async throws -> URL, openFolder: @escaping (URL) -> Bool,
         present: @escaping () -> Void, summaryStatuses: @escaping () -> [String: String] = { [:] },
         summaryBadges: @escaping () -> [String: CallsListState.Row.Summary] = { [:] },
         notes: @escaping (String) async throws -> CallNotesPair? = { _ in nil },
         makeSummary: @escaping (String) -> Void = { _ in },
         makeWithTemplate: @escaping (String, String) -> Void = { _, _ in },
         catalogue: @escaping @Sendable () async -> NotesMenuState.Catalogue = { .init(templates: [.init(id: "Default", name: "Default", enabled: true, isFile: false)]) },
         openTemplatesFolder: @escaping @Sendable () async throws -> Void = {},
         previewText: @escaping @Sendable () -> SummaryPreviewText = { .init(language: .russian) },
         summaryTemplates: @escaping () -> [String: String] = { [:] },
         summaryFailures: @escaping () -> [String: CallDetailFailure] = { [:] },
         publications: @escaping () -> [String: String] = { [:] },
         keepingChanges: AsyncStream<Bool> = AsyncStream { $0.finish() },
         readKeeping: @escaping () -> Bool = { true },
         saveKeeping: @escaping (Bool) throws -> Void = { _ in },
         cancelSummary: @escaping (String) async -> Void = { _ in },
         copy: @escaping (String) -> Void = { _ in },
         readCall: @escaping () -> Void = {},
         retryableSummaries: @escaping () -> Set<String> = { [] },
         retrySummary: @escaping (String) async throws -> Void = { _ in throw CocoaError(.fileWriteUnknown) },
         describe: @escaping (any Error) -> String = SettingsText(language: .russian).callsFailure,
         listText: CallsListText = .init(language: .russian),
         callText: @escaping (String) async throws -> CallsText = { _ in .init(notes: nil, transcript: []) }) {
        self.callText = callText
        self.describe = describe
        self.listText = listText
        self.retryableSummaries = retryableSummaries
        self.retrySummary = retrySummary
        self.copy = copy
        self.readCall = readCall
        self.makeWithTemplate = makeWithTemplate; self.readKeeping = readKeeping; self.saveKeeping = saveKeeping
        self.makeSummary = makeSummary; self.cancelSummary = cancelSummary
        self.summaryTemplates = summaryTemplates
        self.summaryFailures = summaryFailures
        self.summaryStatuses = summaryStatuses
        self.summaryBadges = summaryBadges
        self.notes = notes
        let handler = CallDetailEffectHandler(notes: { @MainActor id in try await notes(id) })
        detailModel = ObservableModel(initialState: .init(), reduce: CallDetailReducer(progress: { previewText()(.remaking, $0) }, failure: { previewText()(failurePhrase($0)) }, transcriptMark: { _ in "Notes from another transcript" }).reduce,
                                      handleEffect: { effect in oneEvent { await handler.handle(effect) } })
        self.inputs = inputs; self.timeZone = timeZone; self.now = now; self.recordingState = recordingState
        self.location = location; self.openFolder = openFolder; self.present = present
        let menuHandler = NotesMenuEffectHandler(catalogue: catalogue, save: { @MainActor in try saveKeeping($0) }, openFolder: openTemplatesFolder)
        menuModel = ObservableModel(initialState: .init(keeping: readKeeping()),
                                    reduce: NotesMenuReducer(section: { previewText()($0 ? .makeAgainSection : .makeSection) }, noUsableFiles: { previewText()(.noUsableTemplates) }).reduce,
                                    handleEffect: { effect in oneEvent { await menuHandler.handle(effect) } })
        let forwardCancellation: @MainActor @Sendable (String) async -> Void = { [weak self] call in
            await self?.cancelSummary(call)
        }
        notesConnections = [
            Task { @MainActor [weak self] in
                var seen: [String: String] = [:]
                for await current in Observations({ publications() }) {
                    guard let self else { return }
                    for (call, publication) in current where seen[call] != publication {
                        detailModel.event(.publicationNotified(id: call))
                    }
                    seen = current
                }
            },
            Task { @MainActor [weak self] in
                for await facts in Observations({ self?.detailModel.state.menuFacts }) {
                    guard let self else { return }
                    menuModel.event(.factsChanged(facts.map { .init(call: $0.call, hasNotes: $0.hasNotes, template: $0.template, busy: $0.busy) }))
                }
            },
            Task { @MainActor [weak self] in
                var seen = 0
                for await (count, intention) in Observations({ (self?.menuModel.state.intentions ?? 0, self?.menuModel.state.intention) }) {
                    guard let self else { return }
                    guard count > seen, let intention else { continue }
                    seen = count
                    makeWithTemplate(intention.call, intention.template)
                }
            },
            Task { @MainActor [weak self] in
                await withDiscardingTaskGroup { group in
                    var seen = 0
                    for await (count, call) in Observations({ (self?.detailModel.state.cancellations ?? 0, self?.detailModel.state.cancelCall) }) {
                        guard self != nil else { break }
                        guard count > seen, let call else { continue }
                        seen = count
                        group.addTask { await forwardCancellation(call) }
                    }
                }
            },
            Task { @MainActor [weak self] in
                for await keeping in keepingChanges {
                    guard let self else { return }
                    menuModel.event(.keepingChanged(keeping))
                }
            },
        ]
    }

    isolated deinit { notesConnections.forEach { $0.cancel() } }

    public var state: CallsListState {
        var recordings = inputs.state()
        let everyCall = recordings.calls
        let filter = list.state.filterTags, words = list.state.searchText
        recordings.calls = CallTags.keep(recordings.calls, having: filter, tags: knownTags)
        var found: [String: CallsListState.Row.Match] = [:]
        let searchOn = !words.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
        if searchOn {
            for call in recordings.calls {
                let match = CallsSearch.match(words, title: call.title, tags: knownTags(call), transcript: [], notes: nil)
                let title = match?.title ?? [], tags = match?.tags ?? []
                let snippet = textMatches[call.id] ?? nil
                guard !title.isEmpty || !tags.isEmpty || snippet != nil else { continue }
                found[call.id] = .init(title: title, snippet: snippet.map(rowSnippet))
            }
            recordings.calls = recordings.calls.filter { found[$0.id] != nil }
        }
        var state = callsListState(recordings, timeZone: timeZone, now: now(), text: listText)
        state.searchText = list.state.query
        state.search = searchOn ? .init(query: words, searching: searching) : nil
        let on = Set(filter.map(CallTags.key))
        state.tagStrip = CallTags.inUse(everyCall.map(knownTags)).map { .init(name: $0, on: on.contains(CallTags.key($0))) }
        let tagsByID = Dictionary(recordings.calls.map { ($0.id, knownTags($0)) }, uniquingKeysWith: { first, _ in first })
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
            state.rows[index].tags = tagsByID[state.rows[index].id] ?? []
        }
        let selectedID = list.state.selectedID
        state.selectedID = state.rows.contains { $0.id == selectedID } ? selectedID : nil
        state.narrow = narrow
        state.editing = list.state.editing.map { .init(id: $0.id, title: $0.title) }
        state.failure = list.state.failure.map(failureText) ?? state.failure
        state.busy = state.busy || list.state.opening
        return state
    }

    private func failureText(_ failure: CallsListMachineState.Failure) -> String {
        switch failure {
        case .retryFailed: listText(.summaryRetryFailed)
        case let .openFailed(id): listText(.openFailed, id)
        case let .locationFailed(id, reason): "«\(id)»: \(reason)"
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
    private func search(_ query: String) {
        searchTask?.cancel()
        let previousSelection = state.selectedID
        list.event(.search(query))
        let text = list.state.searchText
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
                    CallsSearch.match(text, title: "", tags: [], transcript: read.transcript.map { .init(start: $0.start, words: $0.words) }, notes: read.notes)
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
    var idle: Bool { inputs.state().phase == .idle && list.state.editing == nil && !list.state.opening }
    /// The toolbar's merge control: enters merge mode, or leaves it while choosing.
    public func toggleMergeMode() {
        if inputs.state().phase == .merging { inputs.send(.leaveMergeMode) } else { sendRecordings(.enterMergeMode) }
    }
    /// Whether the toolbar's merge control acts now, and whether it reads as leaving merge mode.
    public var mergeControl: (enabled: Bool, merging: Bool) {
        let phase = inputs.state().phase
        return (phase == .idle || phase == .merging, phase == .merging || phase == .warnedFarApart || phase == .runningMerge)
    }
    func sendRecordings(_ event: RecordingsEvent) {
        recordingChanged(recordingState())
        inputs.send(event)
    }
    func drainMove() async {
        inputs.send(.stopActions)
        for await state in Observations({ self.inputs.state() }) where state.stopped { return }
    }

    public func show() {
        list.event(.shown)
        search("")
        inputs.send(.refresh)
        present()
        scanNotes()
        followMerges()
        followTagsSaves()
    }

    /// Hands the list each answer to a tags save, as Recordings gives it.
    private func followTagsSaves() {
        tagsFollow?.cancel()
        tagsFollow = Task {
            for await outcome in Observations({ self.inputs.state().tagsOutcome }) {
                guard let outcome else { continue }
                let result: CallsListMachineState.TagsOutcome
                switch outcome.result {
                case .saved: result = .saved
                case let .failed(reason): result = .failed(reason)
                }
                await sendList(.tagsFinished(request: outcome.request, result))
            }
        }
    }

    /// The tags line for the call the detail shows.
    public var detailTags: CallsDetailTags {
        guard let id = detail?.id else { return .shown([]) }
        guard let editor = list.state.tagsEditor, editor.id == id else {
            return .shown(inputs.state().calls.first { $0.id == id }.map(knownTags) ?? [])
        }
        return .editing(tags: editor.draft, entry: editor.entry, completion: editor.completion,
                        saving: editor.pending != nil, failure: editor.failure)
    }

    /// Hands the list the rows as they are listed, so its actions see each call's state and tags.
    private func syncRows() async -> CallsListState {
        let snapshot = state
        await sendList(.rowsChanged(snapshot.rows.map { .init(id: $0.id, title: $0.title, editable: $0.editable,
                                                               canRetry: $0.canRetrySummary, tags: $0.tags) },
                                    busy: snapshot.busy))
        return snapshot
    }

    private func sendTags(_ event: CallsDetailEvent, id: String) async {
        switch event {
        case .editTags:
            _ = await syncRows()
            await sendList(.beginTags(id, inUse: CallTags.inUse(inputs.state().calls.map(knownTags))))
        case let .typeTag(text): await sendList(.typeTag(text))
        case .completeTag: await sendList(.completeTag)
        case let .removeTag(tag): await sendList(.editTags((list.state.tagsEditor?.draft ?? []).filter { $0 != tag }))
        case .submitTags: await sendList(.submitTags)
        case .cancelTags: await sendList(.cancelTags)
        default: break
        }
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
        mergeFollow?.cancel()
        mergeFollow = nil
        tagsFollow?.cancel()
        tagsFollow = nil
    }

    /// Selects the call a merge made, so the detail reads it as any selected call.
    private func followMerges() {
        mergeFollow?.cancel()
        mergeFollow = Task {
            var seen = inputs.state().mergedCallID
            for await merged in Observations({ self.inputs.state().mergedCallID }) {
                defer { seen = merged }
                guard let id = merged, id != seen else { continue }
                await sendList(.select(id))
                selectDetail()
                detailModel.event(.notesChanged(id: id))
            }
        }
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
                        gists[id] = NotesMarkdown.gist(text.current.text)
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
                     summary: .init(badge: badge, status: row.summaryStatus, canRetry: row.canRetrySummary, template: summaryTemplates()[id], failure: summaryFailures()[id]))
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
        case .notesMenuOpened: menuModel.event(.opened)
        case .openTemplatesFolder: menuModel.event(.openFolder)
        case let .chooseNotesTemplate(template): menuModel.event(.choose(template))
        case .toggleKeeping: menuModel.event(.toggleKeeping)
        case let .chooseNotesVersion(version): detailModel.event(.versionChosen(version))
        case .cancelNotes: detailModel.event(.cancelChosen)
        case .copy: if case let .notes(source, _) = shown.content { copy(source) }
        case .open: await send(.open(shown.id))
        case .rename: await send(.beginRename(shown.id))
        case let .makeSummaryWithTemplate(template): makeWithTemplate(shown.id, template)
        case .makeSummary: await send(.makeSummary(shown.id))
        case .cancelSummary: await cancelSummary(shown.id)
        case .retrySummary: await send(.retrySummary(shown.id))
        case .delete: await send(.askDelete(shown.id))
        case .editTags, .typeTag, .completeTag, .removeTag, .submitTags, .cancelTags: await sendTags(event, id: shown.id)
        }
    }

    /// Sends the list an event and passes each request it makes on to Recordings.
    private func sendList(_ event: CallsListMachineEvent) async {
        let asked = list.state.asked
        list.event(event)
        guard list.state.asked > asked else { return }
        for request in list.state.requests {
            switch request {
            case let .rename(id, title): inputs.send(.rename(id: id, title: title))
            case let .setTags(request, id, tags): inputs.send(.setTags(request: request, id: id, tags: tags))
            case .clearFailure: inputs.send(.clearFailure)
            case let .retrySummary(id):
                let succeeded: Bool
                do { try await retrySummary(id); succeeded = true } catch { succeeded = false }
                await sendList(.retryFinished(id, succeeded: succeeded))
            case let .openFolder(id):
                let outcome: CallsListMachineState.OpenOutcome
                do { outcome = openFolder(try await location(id)) ? .opened : .notOpened }
                catch { outcome = .locationFailed(reason: describe(error)) }
                await sendList(.openFinished(id, outcome))
            }
        }
    }

    func recordingChanged(_ state: RecordingState) {
        let id = recordedCallID(state)
        list.event(.recordingChanged(id: id))
        inputs.send(.recordingChanged(id))
    }

    public func send(_ event: CallsListEvent) async {
        guard !list.state.opening else { return }
        recordingChanged(recordingState())
        let snapshot = await syncRows()
        switch event {
        case let .makeTranscriptAgain(id), let .retryTranscriptAgain(id): inputs.send(.makeTranscriptAgain(id))
        case let .restorePreviousTranscript(id): inputs.send(.restorePreviousTranscript(id))
        case .cancelTranscriptAgain: inputs.send(.cancelTranscriptAgain)
        case let .beginRename(id): await sendList(.beginRename(id))
        case let .editTitle(title): await sendList(.editTitle(title))
        case .cancelRename: await sendList(.cancelRename)
        case .submitRename: await sendList(.submitRename)
        case let .askDelete(id):
            await sendList(.askDelete(id))
            inputs.send(.askDelete(id))
        case .confirmDelete:
            await sendList(.confirmDelete)
            inputs.send(.confirmDelete)
        case .cancelDelete: inputs.send(.cancelDelete)
        case let .select(id):
            await sendList(.select(id))
            selectDetail()
        case let .search(text): search(text)
        case let .toggleTag(tag):
            let previous = state.selectedID
            await sendList(.toggleTag(tag))
            followSelection(previous)
        case let .toggleMark(id): inputs.send(.toggleMergeSelection(id))
        case .confirmMerge: inputs.send(.confirmMerge)
        case .leaveMerge: inputs.send(.leaveMergeMode)
        case .mergeAnyway: inputs.send(.mergeAnyway)
        case .goBackFromWarning: inputs.send(.goBackFromWarning)
        case .selectNext:
            await sendList(.selectNext)
            followSelection(snapshot.selectedID)
        case .selectPrevious:
            await sendList(.selectPrevious)
            followSelection(snapshot.selectedID)
        case let .read(id):
            guard snapshot.rows.contains(where: { $0.id == id }) else { return }
            await sendList(.select(id))
            let opens = detailModel.state.opens
            selectDetail()
            detailModel.event(.openRequested(id: id))
            // CallDetail says when the call is ready to open; a search hiding it ends the request.
            for await (detailState, visibleID) in Observations({ (self.detailModel.state, self.state.selectedID) }) {
                guard visibleID == id else { return }
                if detailState.opens > opens { break }
            }
            readCall()
        case let .makeSummary(id):
            guard !snapshot.busy, let row = snapshot.rows.first(where: { $0.id == id }), row.canMakeSummary else { return }
            makeSummary(id)
        case let .retrySummary(id):
            await sendList(.retry(id))
        case let .open(id): await sendList(.open(id))
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
    case .merging, .warnedFarApart, .runningMerge: busy = false; deleteID = nil
    default: busy = true; deleteID = nil
    }
    let format = CallsListFormat(timeZone: timeZone, text: text)
    let merge: CallsListState.Merge?
    switch state.phase {
    case .merging: merge = .init(marked: state.mergeSelection)
    case .runningMerge: merge = .init(marked: state.mergeSelection, running: true)
    case .warnedFarApart:
        // The calls arrive newest first, so the earliest marked call is the last one.
        let marked = state.calls.filter { state.mergeSelection.contains($0.id) }
        let name = { (call: RecordedCall) in call.title.isEmpty ? format.stamp(call.start) : call.title }
        merge = .init(marked: state.mergeSelection,
                      warning: marked.last.flatMap { earliest in marked.first.map { latest in text(.mergeWarningBody, name(earliest), name(latest)) } })
    default: merge = nil
    }
    let days = state.calls.map { format.day($0.start, now: now) }
    return CallsListState(rows: state.calls.indices.map { index in
        let call = state.calls[index], day = days[index]
        let opens = index == 0 || days[index - 1] != day
        return .init(id: call.id, title: call.title, displayTitle: call.title.isEmpty ? format.stamp(call.start) : call.title,
                     day: opens ? .init(title: day, count: format.count(days[index...].prefix { $0 == day }.count)) : nil,
                     time: format.time(call.start), duration: format.duration(call.duration), editable: call.id != state.recordingID && call.id != state.transcriptRun?.id,
                     transcriptAgain: transcriptOffer(state.transcriptOffers[call.id]?.run, text: text),
                     restoreTranscript: call.hasPreviousTranscript ? transcriptOffer(state.transcriptOffers[call.id]?.restore, text: text) : nil,
                     transcriptWait: state.transcriptRun.flatMap { $0.id == call.id ? transcriptWait($0.wait, text: text) : nil })
    }, deleteID: deleteID, deleteBody: state.calls.first { $0.id == deleteID }.map { call in
        text(.deleteBody, call.id + (call.title.isEmpty ? "" : " " + call.title))
    }, busy: busy || state.isListing, failure: state.failure.flatMap { failure in
        guard failure.kind == .action else { return nil }
        return (failure.id.map { "«\($0)»: " } ?? "") + failure.reason
    }, merge: merge, transcriptBanner: transcriptBanner(state.failure, text: text))
}

/// A call's tags; unreadable ones count as none for filtering and showing.
func knownTags(_ call: RecordedCall) -> [String] {
    if case let .known(tags) = call.tags { tags } else { [] }
}

private func transcriptOffer(_ offer: TranscriptOffer?, text: CallsListText) -> CallsListState.TranscriptOffer {
    switch offer {
    case .available: .available
    case let .unavailable(_, message): .unavailable(message)
    case nil: .unavailable(text(.transcriptUnavailable))
    }
}

private func transcriptWait(_ wait: TranscriptWait, text: CallsListText) -> CallsListState.TranscriptWait {
    switch wait {
    case .preparing: .init(message: text(.transcriptPreparing))
    case let .hearing(progress): .init(message: text(.transcriptHearing), progress: progress)
    case .finishing: .init(message: text(.transcriptFinishing))
    }
}

private func transcriptBanner(_ failure: RecordingsState.Failure?, text: CallsListText) -> CallsListState.TranscriptBanner? {
    guard let failure else { return nil }
    switch failure.kind {
    case .action: return nil
    case .transcriptRun:
        return .init(style: .error, title: text(.transcriptFailed),
                     message: failure.reason + " " + text(.transcriptPreserved), retryID: failure.id)
    case .transcriptRestore:
        return .init(style: .error, title: text(.transcriptRestoreFailed), message: failure.reason)
    case .transcriptStopped:
        return .init(style: .info, title: text(.transcriptStopped),
                     message: failure.reason + " " + text(.transcriptPreserved))
    }
}
