public struct Configuration: Equatable, Sendable {
    public struct Runtime: Equatable, Sendable {
        public enum Kind: String, Sendable { case claudeCLI, compatibleAPI }
        public var kind: Kind
        public var model: String
        public var executable: String
        public var endpoint: String
        public var credentialVariable: String
        public init(kind: Kind, model: String, executable: String, endpoint: String, credentialVariable: String) {
            self.kind = kind; self.model = model; self.executable = executable
            self.endpoint = endpoint; self.credentialVariable = credentialVariable
        }
    }
    public var enabled: Bool
    public var speakers: Bool
    public var primary: Runtime
    public var fallback: Runtime?
    public init(enabled: Bool, speakers: Bool, primary: Runtime, fallback: Runtime? = nil) {
        self.enabled = enabled; self.speakers = speakers; self.primary = primary; self.fallback = fallback
    }
}

public struct State: Equatable, Sendable {
    public enum Phase: Equatable, Sendable { case idle, loading, editing, validating, saving, saved, loadFailed, saveFailed }
    public var phase: Phase
    public var draft: Configuration?
    public var saved: Configuration?
    public var revision: UInt64
    public var validatedRevision: UInt64?
    public var savingRevision: UInt64?
    public var saveAfterValidation: Bool = false
    public var message: String
    public var disclosure: String
    public var issues: [ValidationIssue]
    public var runtimes: [RenderedRuntime]
    public var canSave: Bool
    public var canValidate: Bool
    public var saveAction: SaveAction
    public var statusTone: StatusTone
    public var showsSaveFailure: Bool
    public enum SaveAction: Sendable { case save, retrySave }
    public enum StatusTone: Sendable { case secondary, success, error }
    public init(phase: Phase = .idle, draft: Configuration? = nil, saved: Configuration? = nil,
                revision: UInt64 = 0, validatedRevision: UInt64? = nil, savingRevision: UInt64? = nil,
                message: String = "", disclosure: String = "", issues: [ValidationIssue] = [],
                runtimes: [RenderedRuntime] = [], canSave: Bool = false, canValidate: Bool = false,
                saveAction: SaveAction = .save, statusTone: StatusTone = .secondary, showsSaveFailure: Bool = false) {
        self.phase = phase; self.draft = draft; self.saved = saved; self.revision = revision
        self.validatedRevision = validatedRevision; self.savingRevision = savingRevision
        self.message = message; self.disclosure = disclosure
        self.issues = issues; self.runtimes = runtimes; self.canSave = canSave; self.canValidate = canValidate
        self.saveAction = saveAction; self.statusTone = statusTone; self.showsSaveFailure = showsSaveFailure
    }
}

public enum Slot: Sendable { case primary, fallback }
public enum Field: Sendable { case model, executable, endpoint, credentialVariable }
public struct ValidationIssue: Equatable, Sendable {
    public enum Reason: Sendable { case invalid, unavailable, authentication }
    public var slot: Slot
    public var field: Field
    public var reason: Reason
    public var hidesValue: Bool
    public init(slot: Slot, field: Field, reason: Reason = .invalid, hidesValue: Bool = false) {
        self.slot = slot; self.field = field; self.reason = reason; self.hidesValue = hidesValue
    }
}
public struct RenderedField: Equatable, Sendable {
    public var field: Field
    public var value: String
    public var isInvalid: Bool
    public init(field: Field, value: String, isInvalid: Bool) {
        self.field = field; self.value = value; self.isInvalid = isInvalid
    }
}
public struct RenderedRuntime: Equatable, Sendable {
    public var slot: Slot
    public var kind: Configuration.Runtime.Kind?
    public var fields: [RenderedField]
    public var disclosure: String
    public init(slot: Slot, kind: Configuration.Runtime.Kind?, fields: [RenderedField], disclosure: String) {
        self.slot = slot; self.kind = kind; self.fields = fields; self.disclosure = disclosure
    }
}
public enum Event: Equatable, Sendable {
    case setEnabled(Bool), setSpeakers(Bool), selectKind(Slot, Configuration.Runtime.Kind?), editField(Slot, Field, String)
    case load, loaded(Configuration), loadFailed
    case edit(Configuration), validate, validated(UInt64, [ValidationIssue]), save
    case saved(UInt64, Configuration), saveFailed(UInt64)
    /// The text dependencies now answer differently, as after a language change: write the shown text again.
    case render
}
public enum Effect: Equatable, Sendable {
    case load, validate(UInt64, Configuration), save(UInt64, Configuration)
}

public struct Reducer: Sendable {
    private let disclosure: @Sendable (Configuration) -> String
    private let message: @Sendable (State.Phase) -> String
    private let safety: @Sendable (Configuration) -> [ValidationIssue]
    private let issueMessage: @Sendable (ValidationIssue) -> String
    private let runtimeDisclosure: @Sendable (Configuration.Runtime?) -> String
    public init(disclosure: @escaping @Sendable (Configuration) -> String,
                message: @escaping @Sendable (State.Phase) -> String,
                safety: @escaping @Sendable (Configuration) -> [ValidationIssue],
                issueMessage: @escaping @Sendable (ValidationIssue) -> String,
                runtimeDisclosure: @escaping @Sendable (Configuration.Runtime?) -> String) {
        self.disclosure = disclosure; self.message = message
        self.safety = safety; self.issueMessage = issueMessage; self.runtimeDisclosure = runtimeDisclosure
    }
    public func reduce(_ state: State, _ event: Event) -> (State, Effect?) {
        var next = state
        var effect: Effect?
        switch event {
        case let .setEnabled(value):
            guard var draft = state.draft else { return (state, nil) }
            draft.enabled = value; return reduce(state, .edit(draft))
        case let .setSpeakers(value):
            guard var draft = state.draft else { return (state, nil) }
            draft.speakers = value; return reduce(state, .edit(draft))
        case let .selectKind(slot, kind):
            guard var draft = state.draft else { return (state, nil) }
            guard let kind else {
                guard slot == .fallback else { return (state, nil) }
                draft.fallback = nil
                return reduce(state, .edit(draft))
            }
            var runtime = (slot == .primary ? draft.primary : draft.fallback)
                ?? Configuration.Runtime(kind: kind, model: "", executable: "", endpoint: "", credentialVariable: "")
            runtime.kind = kind
            if kind == .claudeCLI {
                runtime.model = "sonnet"; runtime.executable = ""
                // API fields leave the editor when selecting CLI; discard their hidden secrets.
                runtime.endpoint = ""; runtime.credentialVariable = ""
            }
            else { runtime.model = "gpt-4.1-mini"; runtime.endpoint = "https://api.openai.com/v1"; runtime.credentialVariable = "OPENAI_API_KEY" }
            if slot == .primary { draft.primary = runtime } else { draft.fallback = runtime }
            return reduce(state, .edit(draft))
        case let .editField(slot, field, value):
            guard var draft = state.draft else { return (state, nil) }
            guard var runtime = (slot == .primary ? draft.primary : draft.fallback) else { return (state, nil) }
            switch field {
            case .model: runtime.model = value
            case .executable: runtime.executable = value
            case .endpoint: runtime.endpoint = value
            case .credentialVariable: runtime.credentialVariable = value
            }
            if slot == .primary { draft.primary = runtime } else { draft.fallback = runtime }
            return reduce(state, .edit(draft))
        case .load where state.phase == .idle || state.phase == .loadFailed:
            next.phase = .loading; effect = .load
        case let .loaded(config) where state.phase == .loading:
            next.phase = .saved; next.draft = config; next.saved = config
            next.disclosure = disclosure(config)
            next.issues = safety(config)
        case .loadFailed where state.phase == .loading: next.phase = .loadFailed
        case .render:
            if let draft = state.draft { next.disclosure = disclosure(draft) }
        case let .edit(config) where state.draft != nil:
            next.draft = config; next.revision += 1; next.validatedRevision = nil
            next.saveAfterValidation = false
            next.phase = state.savingRevision != nil ? .saving : config == state.saved ? .saved : .editing
            next.disclosure = disclosure(config)
            next.issues = safety(config)
        case .validate where state.draft != nil && state.savingRevision == nil && state.phase != .validating:
            next.issues = safety(state.draft!)
            next.validatedRevision = nil
            if next.issues.isEmpty {
                next.phase = .validating; effect = .validate(state.revision, state.draft!)
            }
        case let .validated(revision, issues) where revision == state.revision && state.phase == .validating:
            next.phase = state.draft == state.saved ? .saved : .editing
            next.validatedRevision = issues.isEmpty ? revision : nil
            next.issues = issues
            next.saveAfterValidation = false
            if state.saveAfterValidation && issues.isEmpty {
                return reduce(next, .save)
            }
        case .save where state.savingRevision == nil && state.phase != .validating && state.draft != nil && state.draft != state.saved && state.issues.isEmpty:
            next.issues = safety(state.draft!)
            // Disabling still checks persisted syntax, without needing a live provider.
            if next.issues.isEmpty {
                if state.draft!.enabled && state.validatedRevision != state.revision {
                    next.phase = .validating; next.saveAfterValidation = true
                    effect = .validate(state.revision, state.draft!)
                } else {
                    next.phase = .saving; next.savingRevision = state.revision
                    effect = .save(state.revision, state.draft!)
                }
            }
        case let .saved(revision, config) where state.savingRevision == revision:
            next.saved = config; next.savingRevision = nil
            next.phase = revision == state.revision ? .saved : .editing
        case let .saveFailed(revision) where state.savingRevision == revision:
            next.savingRevision = nil; next.phase = .saveFailed
        default: return (state, nil)
        }
        let busy = next.savingRevision != nil || next.phase == .validating
        next.canValidate = next.draft != nil && !busy
        next.canSave = next.draft != nil && !busy && next.draft != next.saved
            && next.issues.isEmpty
        next.saveAction = next.phase == .saveFailed ? .retrySave : .save
        next.showsSaveFailure = next.phase == .saveFailed
        let failed = next.phase == .saveFailed || next.phase == .loadFailed
        next.statusTone = failed ? .error : busy ? .secondary : !next.issues.isEmpty ? .error : next.phase == .saved ? .success : .secondary
        next.message = busy || failed ? message(next.phase) : next.issues.first.map(issueMessage) ?? message(next.phase)
        if let draft = next.draft {
            next.runtimes = [(Slot.primary, draft.primary), (.fallback, draft.fallback)].map { slot, runtime in
                guard let runtime else {
                    return RenderedRuntime(slot: slot, kind: nil, fields: [], disclosure: runtimeDisclosure(nil))
                }
                var fields: [(Field, String)] = [(.model, runtime.model)]
                fields += runtime.kind == .claudeCLI ? [(.executable, runtime.executable)] : [(.endpoint, runtime.endpoint), (.credentialVariable, runtime.credentialVariable)]
                return RenderedRuntime(slot: slot, kind: runtime.kind, fields: fields.map { field, value in
                    let invalid = next.issues.contains { $0.slot == slot && $0.field == field }
                    // Unsafe URL and credential-reference input must not be echoed as a secret.
                    let hidden = next.issues.contains { $0.slot == slot && $0.field == field && $0.hidesValue }
                    return RenderedField(field: field, value: hidden ? "" : value, isInvalid: invalid)
                }, disclosure: runtimeDisclosure(runtime))
            }
        }
        return (next, effect)
    }
}

public protocol Preferences: Sendable {
    func load() async throws -> Configuration
    func save(_ configuration: Configuration) async throws
}
public protocol Availability: Sendable {
    /// Checks provider readiness without sending a transcript or paid prompt.
    func validate(_ configuration: Configuration) async -> [ValidationIssue]
}
public struct EffectHandler: Sendable {
    private let preferences: any Preferences
    private let availability: any Availability
    public init(preferences: any Preferences, availability: any Availability) {
        self.preferences = preferences; self.availability = availability
    }
    public func handle(_ effect: Effect) async -> Event {
        switch effect {
        case .load:
            do { return .loaded(try await preferences.load()) } catch { return .loadFailed }
        case let .validate(revision, config):
            return .validated(revision, config.enabled ? await availability.validate(config) : [])
        case let .save(revision, config):
            do { try await preferences.save(config); return .saved(revision, config) }
            catch { return .saveFailed(revision) }
        }
    }
}
