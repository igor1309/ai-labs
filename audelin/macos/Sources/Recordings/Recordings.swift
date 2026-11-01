import Foundation

/// The list and operations this machine needs; Compose supplies the disk adapter.
public protocol RecordingsCalls: Sendable {
    func list() async throws -> [RecordedCall]
    func rename(id: String, title: String) async throws
    func delete(id: String) async throws
}

public struct RecordedCall: Equatable, Sendable {
    public let id: String
    public let title: String
    public let start: Date
    public let duration: TimeInterval?

    public init(id: String, title: String, start: Date, duration: TimeInterval?) {
        self.id = id; self.title = title; self.start = start; self.duration = duration
    }
}

public struct RecordingsState: Equatable, Sendable {
    public enum Phase: Equatable, Sendable {
        case idle, askingDelete(String), renaming(String), deleting(String)
    }

    public struct Failure: Equatable, Sendable {
        public let id: String?
        public let reason: String
        public init(id: String?, reason: String) { self.id = id; self.reason = reason }
    }

    public var calls: [RecordedCall] = []
    public var isListing = false
    public var phase: Phase = .idle
    public var recordingID: String?
    public var failure: Failure?

    public init() {}
}

public enum RecordingsEvent: Equatable, Sendable {
    case refresh, reloadAfterFailure, clearFailure, listed([RecordedCall]), listFailed(String)
    case recordingChanged(String?)
    case rename(id: String, title: String), renamed(String), renameFailed(id: String, reason: String)
    case askDelete(String), confirmDelete, cancelDelete, deleted(String), deleteFailed(id: String, reason: String)
}

public enum RecordingsEffect: Equatable, Sendable {
    case list, rename(id: String, title: String), delete(String)
}

public enum RecordingsReducer {
    public static func reduce(_ state: RecordingsState, _ event: RecordingsEvent) -> (RecordingsState, RecordingsEffect?) {
        var state = state
        switch event {
        case let .recordingChanged(id):
            state.recordingID = id
        case .clearFailure:
            state.failure = nil
        case .refresh, .reloadAfterFailure:
            guard state.phase == .idle, !state.isListing else { return (state, nil) }
            state.isListing = true
            if event == .refresh { state.failure = nil }
            return (state, .list)
        case let .listed(calls):
            guard state.isListing else { return (state, nil) }
            state.calls = calls
            state.isListing = false
        case let .listFailed(reason):
            guard state.isListing else { return (state, nil) }
            state.isListing = false
            if let failure = state.failure {
                state.failure = .init(id: failure.id, reason: failure.reason + " Не удалось обновить список: " + reason)
            } else {
                state.failure = .init(id: nil, reason: reason)
            }
        case let .rename(id, title):
            guard acceptsAction(state), id != state.recordingID else { return (state, nil) }
            state.phase = .renaming(id)
            state.failure = nil
            return (state, .rename(id: id, title: title))
        case let .renamed(id):
            guard state.phase == .renaming(id) else { return (state, nil) }
            state.phase = .idle
            state.isListing = true
            return (state, .list)
        case let .renameFailed(id, reason):
            guard state.phase == .renaming(id) else { return (state, nil) }
            state.phase = .idle
            state.failure = .init(id: id, reason: reason)
        case let .askDelete(id):
            guard acceptsAction(state), id != state.recordingID else { return (state, nil) }
            state.phase = .askingDelete(id)
            state.failure = nil
        case .cancelDelete:
            guard case .askingDelete = state.phase else { return (state, nil) }
            state.phase = .idle
        case .confirmDelete:
            guard case let .askingDelete(id) = state.phase, id != state.recordingID else { return (state, nil) }
            state.phase = .deleting(id)
            state.failure = nil
            return (state, .delete(id))
        case let .deleted(id):
            guard state.phase == .deleting(id) else { return (state, nil) }
            state.phase = .idle
            state.isListing = true
            return (state, .list)
        case let .deleteFailed(id, reason):
            guard state.phase == .deleting(id) else { return (state, nil) }
            state.phase = .idle
            state.failure = .init(id: id, reason: reason)
        }
        return (state, nil)
    }

    private static func acceptsAction(_ state: RecordingsState) -> Bool {
        guard !state.isListing else { return false }
        switch state.phase {
        case .idle, .askingDelete: return true
        default: return false
        }
    }
}

public struct RecordingsEffectHandler: Sendable {
    private let calls: any RecordingsCalls
    public init(calls: any RecordingsCalls) { self.calls = calls }

    public func handle(_ effect: RecordingsEffect) -> AsyncStream<RecordingsEvent> {
        AsyncStream { output in
            let task = Task {
                output.yield(await perform(effect))
                output.finish()
            }
            output.onTermination = { _ in task.cancel() }
        }
    }

    private func perform(_ effect: RecordingsEffect) async -> RecordingsEvent {
        switch effect {
        case .list:
            do { return .listed(try await calls.list()) }
            catch { return .listFailed(error.localizedDescription) }
        case let .rename(id, title):
            do { try await calls.rename(id: id, title: title); return .renamed(id) }
            catch { return .renameFailed(id: id, reason: error.localizedDescription) }
        case let .delete(id):
            do { try await calls.delete(id: id); return .deleted(id) }
            catch { return .deleteFailed(id: id, reason: error.localizedDescription) }
        }
    }
}
