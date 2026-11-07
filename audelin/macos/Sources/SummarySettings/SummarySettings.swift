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
    public var fallback: Runtime
    public init(enabled: Bool, speakers: Bool, primary: Runtime, fallback: Runtime) {
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
    public var message: String
    public var disclosure: String
    public init(phase: Phase = .idle, draft: Configuration? = nil, saved: Configuration? = nil,
                revision: UInt64 = 0, validatedRevision: UInt64? = nil, savingRevision: UInt64? = nil,
                message: String = "", disclosure: String = "") {
        self.phase = phase; self.draft = draft; self.saved = saved; self.revision = revision
        self.validatedRevision = validatedRevision; self.savingRevision = savingRevision
        self.message = message; self.disclosure = disclosure
    }
}

public enum Event: Equatable, Sendable {
    case load, loaded(Configuration), loadFailed
    case edit(Configuration), validate, validated(UInt64, String?), save
    case saved(UInt64, Configuration), saveFailed(UInt64)
}
public enum Effect: Equatable, Sendable {
    case load, validate(UInt64, Configuration), save(UInt64, Configuration)
}

public struct Reducer: Sendable {
    private let disclosure: @Sendable (Configuration) -> String
    private let message: @Sendable (State.Phase) -> String
    public init(disclosure: @escaping @Sendable (Configuration) -> String,
                message: @escaping @Sendable (State.Phase) -> String) {
        self.disclosure = disclosure; self.message = message
    }
    public func reduce(_ state: State, _ event: Event) -> (State, Effect?) {
        var next = state
        var effect: Effect?
        switch event {
        case .load where state.phase == .idle || state.phase == .loadFailed:
            next.phase = .loading; effect = .load
        case let .loaded(config) where state.phase == .loading:
            next.phase = .saved; next.draft = config; next.saved = config
            next.disclosure = disclosure(config)
        case .loadFailed where state.phase == .loading: next.phase = .loadFailed
        case let .edit(config) where state.draft != nil:
            next.draft = config; next.revision += 1; next.validatedRevision = nil
            next.phase = state.savingRevision == nil ? .editing : .saving
            next.disclosure = disclosure(config)
        case .validate where state.draft != nil && state.savingRevision == nil && state.phase != .validating:
            next.phase = .validating; effect = .validate(state.revision, state.draft!)
        case let .validated(revision, error) where revision == state.revision && state.phase == .validating:
            next.phase = .editing; next.validatedRevision = error == nil ? revision : nil
            next.message = error ?? message(.editing)
            return (next, nil)
        case .save where state.savingRevision == nil && state.draft != nil && state.draft != state.saved:
            // The off switch never depends on an available provider.
            guard state.draft!.enabled == false || state.validatedRevision == state.revision else { return (state, nil) }
            next.phase = .saving; next.savingRevision = state.revision
            effect = .save(state.revision, state.draft!)
        case let .saved(revision, config) where state.savingRevision == revision:
            next.saved = config; next.savingRevision = nil
            next.phase = revision == state.revision ? .saved : .editing
        case let .saveFailed(revision) where state.savingRevision == revision:
            next.savingRevision = nil; next.phase = .saveFailed
        default: return (state, nil)
        }
        next.message = message(next.phase)
        return (next, effect)
    }
}

public protocol Preferences: Sendable {
    func load() async throws -> Configuration
    func save(_ configuration: Configuration) async throws
}
public protocol Availability: Sendable {
    /// Returns a safe, user-facing error, without sending transcript or a paid prompt.
    func validate(_ configuration: Configuration) async -> String?
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
        case let .validate(revision, config): return .validated(revision, await availability.validate(config))
        case let .save(revision, config):
            do { try await preferences.save(config); return .saved(revision, config) }
            catch { return .saveFailed(revision) }
        }
    }
}
