import Foundation

public enum CallDetailFailure: Equatable, Sendable {
    case unavailable, authentication, quota, transport, invalidResponse, outputLimit, timeout, cancelled, configuration, unknown
}

/// What the detail knows about the selected call and what it currently shows.
public struct CallDetailState: Equatable, Sendable {
    public struct Call: Equatable, Sendable {
        public struct Summary: Equatable, Sendable {
            public enum Badge: Equatable, Sendable { case none, pending, failed }
            public var badge: Badge
            public var status: String
            public var canRetry: Bool
            public var template: String?
            public var failure: CallDetailFailure?

            public init(badge: Badge, status: String, canRetry: Bool, template: String? = nil, failure: CallDetailFailure? = nil) {
                self.badge = badge; self.status = status; self.canRetry = canRetry; self.template = template; self.failure = failure
            }
        }

        public var id: String
        public var title: String
        public var date: String
        public var duration: String
        public var editable: Bool
        public var summary: Summary

        public init(id: String, title: String, date: String, duration: String, editable: Bool, summary: Summary) {
            self.id = id; self.title = title; self.date = date; self.duration = duration
            self.editable = editable; self.summary = summary
        }
    }

    public enum Notes: Equatable, Sendable {
        case notRead
        case read(CallNotesPair)
        case absent
        case unreadable(reason: String)
    }

    public struct MenuFacts: Equatable, Sendable {
        public var call: String
        public var hasNotes: Bool
        public var template: String?
        public var busy: Bool
        public init(call: String, hasNotes: Bool, template: String?, busy: Bool) {
            self.call = call; self.hasNotes = hasNotes; self.template = template; self.busy = busy
        }
    }
    public var showCurrentAfterRead: Bool
    public var menuFacts: MenuFacts?
    public var cancelCall: String?
    public var cancellations: Int
    public var selected: Call?
    public var notes: Notes
    public var detail: CallsDetail?
    /// Distinguishes overlapping reads, including rereads of the same call.
    public var revision: Int
    /// The call to open in its own window once its read answers.
    public var pendingOpen: String?
    /// The call last ready to open in its own window, nil before the first.
    public var opened: String?
    /// How many times a call became ready to open; it opens when this grows.
    public var opens: Int

    public init(selected: Call? = nil, notes: Notes = .notRead, detail: CallsDetail? = nil, revision: Int = 0,
                pendingOpen: String? = nil, opened: String? = nil, opens: Int = 0, menuFacts: MenuFacts? = nil,
                cancelCall: String? = nil, cancellations: Int = 0, showCurrentAfterRead: Bool = false) {
        self.selected = selected; self.notes = notes; self.detail = detail; self.revision = revision
        self.pendingOpen = pendingOpen; self.opened = opened; self.opens = opens
        self.showCurrentAfterRead = showCurrentAfterRead
        self.menuFacts = menuFacts; self.cancelCall = cancelCall; self.cancellations = cancellations
    }
}

public enum CallDetailEvent: Equatable, Sendable {
    case publicationNotified(id: String)
    case versionChosen(CallNotesVersion)
    case cancelChosen
    case selectionChanged(CallDetailState.Call?)
    case summaryChanged(id: String, summary: CallDetailState.Call.Summary)
    case notesChanged(id: String)
    case readFinished(id: String, revision: Int, result: CallDetailState.Notes)
    /// The user asked to read the selected call in its own window.
    case openRequested(id: String)
}

public enum CallDetailEffect: Equatable, Sendable {
    case read(id: String, revision: Int)
}

public struct CallDetailReducer: Sendable {
    private let progress: @Sendable (String) -> String
    private let failure: @Sendable (CallDetailFailure) -> String
    public init(progress: @escaping @Sendable (String) -> String, failure: @escaping @Sendable (CallDetailFailure) -> String) {
        self.progress = progress; self.failure = failure
    }

    public func reduce(_ state: CallDetailState, _ event: CallDetailEvent) -> (CallDetailState, CallDetailEffect?) {
        var state = state
        switch event {
        case let .publicationNotified(id):
            guard state.selected?.id == id else { return (state, nil) }
            state.showCurrentAfterRead = true
        case let .versionChosen(version):
            guard var detail = state.detail, let pair = detail.pair,
                  detail.id == state.selected?.id, version != detail.version,
                  let notes = version == .current ? pair.current : pair.previous else { return (state, nil) }
            detail.version = version
            detail.content = .notes(notes.text, made: notes.made)
            detail.template = notes.templateName
            state.detail = detail
            state.menuFacts?.template = notes.templateID
            return (state, nil)
        case .cancelChosen:
            guard let detail = state.detail, let facts = state.menuFacts, facts.call == detail.id, facts.busy else { return (state, nil) }
            state.cancelCall = detail.id
            state.cancellations += 1
            return (state, nil)
        case let .selectionChanged(call):
            if call?.id != state.pendingOpen { state.pendingOpen = nil }
            state.showCurrentAfterRead = false
            state.selected = call
            if call == nil { state.menuFacts = nil }
            state.notes = .notRead
            guard call != nil else {
                state.detail = nil
                return (state, nil)
            }
        case let .summaryChanged(id, summary):
            guard state.selected?.id == id, state.selected?.summary != summary else { return (state, nil) }
            state.selected?.summary = summary
        case let .notesChanged(id):
            guard state.selected?.id == id else { return (state, nil) }
        case let .readFinished(id, revision, result):
            guard let call = state.selected, call.id == id, revision == state.revision,
                  state.notes == .notRead, result != .notRead else { return (state, nil) }
            state.notes = result
            var version = CallNotesVersion.current
            let content: CallsDetail.Content
            switch result {
            case let .read(pair):
                let previous = !state.showCurrentAfterRead && state.detail?.id == id && state.detail?.pair == pair && state.detail?.version == .previous
                version = previous ? .previous : .current
                let notes = previous ? pair.previous ?? pair.current : pair.current
                content = .notes(notes.text, made: notes.made)
            case let .unreadable(reason): content = .unreadable(reason)
            case .absent:
                switch call.summary.badge {
                case .pending: content = .preparing
                case .failed: content = .failed(reason: call.summary.failure.map(failure) ?? call.summary.status, canRetry: call.summary.canRetry && call.editable)
                case .none: content = .none
                }
            case .notRead: return (state, nil)
            }
            state.showCurrentAfterRead = false
            state.detail = .init(id: call.id, title: call.title, date: call.date, duration: call.duration, content: content)
            if case let .read(pair) = result {
                let previous = version == .previous
                state.detail?.pair = pair
                state.detail?.version = previous ? .previous : .current
                let shown = previous ? pair.previous ?? pair.current : pair.current
                state.detail?.template = shown.templateName
                state.detail?.progress = call.summary.badge == .pending ? progress(call.summary.template ?? pair.current.templateName) : nil
                state.detail?.failure = call.summary.badge == .failed ? call.summary.failure.map(failure) ?? call.summary.status : nil
                state.menuFacts = .init(call: id, hasNotes: true, template: shown.templateID, busy: call.summary.badge == .pending)
            } else {
                state.menuFacts = .init(call: id, hasNotes: false, template: nil, busy: call.summary.badge == .pending)
            }
            if state.pendingOpen == id { open(id, &state) }
            return (state, nil)
        case let .openRequested(id):
            guard state.selected?.id == id else { return (state, nil) }
            if state.notes != .notRead, state.detail?.id == id { open(id, &state) }
            else { state.pendingOpen = id }
            return (state, nil)
        }
        guard let call = state.selected else { return (state, nil) }
        state.notes = .notRead
        state.revision += 1
        return (state, .read(id: call.id, revision: state.revision))
    }

    private func open(_ id: String, _ state: inout CallDetailState) {
        state.pendingOpen = nil
        state.opened = id
        state.opens += 1
    }
}

/// Reads notes and returns their outcome; display decisions belong to the reducer.
public struct CallDetailEffectHandler: Sendable {
    private let notes: @Sendable (String) async throws -> CallNotesPair?

    public init(notes: @escaping @Sendable (String) async throws -> CallNotesPair?) {
        self.notes = notes
    }

    public func handle(_ effect: CallDetailEffect) async -> CallDetailEvent {
        switch effect {
        case let .read(id, revision):
            let result: CallDetailState.Notes
            do {
                if let read = try await notes(id) { result = .read(read) }
                else { result = .absent }
            } catch { result = .unreadable(reason: error.localizedDescription) }
            return .readFinished(id: id, revision: revision, result: result)
        }
    }
}
