import Foundation

/// The list and operations this machine needs; Compose supplies the disk adapter.
public protocol RecordingsCalls: Sendable {
    func list() async throws -> [RecordedCall]
    func rename(id: String, title: String) async throws
    func delete(id: String) async throws
    func prepareMove(to destination: URL) async throws -> [MoveCall]
    func move(id: String, to: URL) async throws -> Int64
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
        case countingMove, countFailed, askingMove, reservingMove, preparingMove, moving, storingFolder, releasingMove, failedMove, refusedMove
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

    public var callsFolder: URL?
    public var callsFolderAvailable = true
    public var stopping = false
    public var move: CallsFolderMove?

    public init(calls: [RecordedCall] = [], isListing: Bool = false, phase: Phase = .idle,
                recordingID: String? = nil, failure: Failure? = nil, callsFolder: URL? = nil,
                callsFolderAvailable: Bool = true, stopping: Bool = false, move: CallsFolderMove? = nil) {
        self.calls = calls; self.isListing = isListing; self.phase = phase; self.recordingID = recordingID
        self.failure = failure; self.callsFolder = callsFolder; self.callsFolderAvailable = callsFolderAvailable; self.stopping = stopping; self.move = move
    }
}

public enum RecordingsEvent: Equatable, Sendable {
    case stopActions
    case refresh, reloadAfterFailure, clearFailure, listed([RecordedCall]), listFailed(String)
    case recordingChanged(String?)
    case rename(id: String, title: String), renamed(String), renameFailed(id: String, reason: String)
    case chooseFolder(URL), movePrepared([MoveCall]), movePreparationFailed(String)
    case confirmMove, retryMove, cancelMove, moveReserved(Bool), moveReleased
    case callMoved(id: String, bytes: Int64), callMoveFailed(id: String, reason: String)
    case folderStored, folderStoreFailed(String)
    case askDelete(String), confirmDelete, cancelDelete, deleted(String), deleteFailed(id: String, reason: String)
}

public enum RecordingsEffect: Equatable, Sendable {
    case prepareMove(URL), reserveMove, releaseMove, moveCall(id: String, to: URL), storeFolder(URL)
    case list, rename(id: String, title: String), delete(String)
}

public struct RecordingsReducer: Sendable {
    private let failureMessage: @Sendable (String, String) -> String

    let moveText: @Sendable (CallsFolderMove) -> MoveText

    public init(failureMessage: @escaping @Sendable (String, String) -> String, moveText: @escaping @Sendable (CallsFolderMove) -> MoveText) {
        self.failureMessage = failureMessage
        self.moveText = moveText
    }

    public func reduce(_ state: RecordingsState, _ event: RecordingsEvent) -> (RecordingsState, RecordingsEffect?) {
        if let result = reduceMove(state, event) { return result }
        var state = state
        switch event {
        case .stopActions:
            state.stopping = true
        case let .recordingChanged(id):
            state.recordingID = id
            if id == nil, state.phase == .refusedMove { state.phase = .idle; state.move = nil }
        case .clearFailure:
            switch state.phase {
            case .idle, .askingDelete: state.failure = nil
            default: return (state, nil)
            }
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
                state.failure = .init(id: failure.id, reason: failureMessage(failure.reason, reason))
            } else {
                state.failure = .init(id: nil, reason: reason)
            }
        case let .rename(id, title):
            guard Self.acceptsAction(state), id != state.recordingID else { return (state, nil) }
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
            guard Self.acceptsAction(state), id != state.recordingID else { return (state, nil) }
            state.phase = .askingDelete(id)
            state.failure = nil
        case .cancelDelete:
            guard case .askingDelete = state.phase else { return (state, nil) }
            state.phase = .idle
        case .confirmDelete:
            guard !state.stopping, case let .askingDelete(id) = state.phase, id != state.recordingID else { return (state, nil) }
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
        default: break
        }
        return (state, nil)
    }

    static func acceptsAction(_ state: RecordingsState) -> Bool {
        guard !state.stopping, !state.isListing else { return false }
        switch state.phase {
        case .idle, .askingDelete: return true
        default: return false
        }
    }
}

public struct RecordingsEffectHandler: Sendable {
    private let calls: any RecordingsCalls
    private let reserve: @Sendable () async -> Bool
    private let release: @Sendable () async -> Void
    private let storeFolder: @Sendable (URL) async throws -> Void
    private let describe: @Sendable (any Error) -> String
    /// `describe` writes the sentence a failure shows, in the language the UI chose.
    public init(calls: any RecordingsCalls, reserve: @escaping @Sendable () async -> Bool,
                release: @escaping @Sendable () async -> Void, storeFolder: @escaping @Sendable (URL) async throws -> Void,
                describe: @escaping @Sendable (any Error) -> String) {
        self.calls = calls; self.reserve = reserve; self.release = release; self.storeFolder = storeFolder; self.describe = describe
    }

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
        case .reserveMove: return .moveReserved(await reserve())
        case .releaseMove: await release(); return .moveReleased
        case let .prepareMove(destination):
            do { return .movePrepared(try await calls.prepareMove(to: destination)) }
            catch { return .movePreparationFailed(describe(error)) }
        case let .moveCall(id, destination):
            do { return .callMoved(id: id, bytes: try await calls.move(id: id, to: destination)) }
            catch { return .callMoveFailed(id: id, reason: describe(error)) }
        case let .storeFolder(destination):
            do { try await storeFolder(destination); return .folderStored }
            catch { return .folderStoreFailed(describe(error)) }
        case .list:
            do { return .listed(try await calls.list()) }
            catch { return .listFailed(describe(error)) }
        case let .rename(id, title):
            do { try await calls.rename(id: id, title: title); return .renamed(id) }
            catch { return .renameFailed(id: id, reason: describe(error)) }
        case let .delete(id):
            do { try await calls.delete(id: id); return .deleted(id) }
            catch { return .deleteFailed(id: id, reason: describe(error)) }
        }
    }
}
