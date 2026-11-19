import Foundation

/// The list and operations this machine needs; Compose supplies the disk adapter.
public protocol RecordingsCalls: Sendable {
    /// The calls with their tags; a call whose tags cannot be read says so.
    func list() async throws -> [RecordedCall]
    func rename(id: String, title: String) async throws
    func delete(id: String) async throws
    func prepareMove(to destination: URL) async throws -> [MoveCall]
    func move(id: String, to: URL) async throws -> Int64
    /// Merges the calls into one and returns the merged call's id, or throws why not.
    func merge(ids: [String]) async throws -> String
    /// Replaces a call's tags.
    func setTags(id: String, tags: [String]) async throws
    /// Swaps the call's current and previous transcripts, or throws why not.
    func restorePreviousTranscript(id: String) async throws
}

public struct RecordedCall: Equatable, Sendable {
    /// A call's tags as listed, or that its tags file could not be read.
    public enum Tags: Equatable, Sendable { case known([String]), unreadable }

    public let id: String
    public let title: String
    public let start: Date
    public let duration: TimeInterval?
    public let tags: Tags
    public let hasPreviousTranscript: Bool
    public let missingTracks: [MissingRecordingTrack]

    public init(id: String, title: String, start: Date, duration: TimeInterval?, tags: Tags = .known([]),
                hasPreviousTranscript: Bool = false, missingTracks: [MissingRecordingTrack] = []) {
        self.id = id; self.title = title; self.start = start; self.duration = duration; self.tags = tags
        self.hasPreviousTranscript = hasPreviousTranscript; self.missingTracks = missingTracks
    }
}

public struct RecordingsState: Equatable, Sendable {
    public enum Phase: Equatable, Sendable {
        case idle, askingDelete(String), renaming(String), deleting(String)
        case countingMove, countFailed, askingMove, reservingMove, preparingMove, moving, storingFolder, releasingMove, failedMove, refusedMove
        /// Choosing calls to merge into one.
        case merging
        /// Asking again before merging calls with an unselected call between them.
        case warnedFarApart
        /// The merge port is merging the selected calls.
        case runningMerge
        case restoring(String)
    }

    public struct Failure: Equatable, Sendable {
        public enum Kind: Equatable, Sendable { case action, transcriptRun, transcriptStopped, transcriptRestore }
        public let id: String?
        public let reason: String
        public let kind: Kind
        public init(id: String?, reason: String, kind: Kind = .action) {
            self.id = id; self.reason = reason; self.kind = kind
        }
    }

    public var calls: [RecordedCall] = []
    public var isListing = false
    /// The latest list request; only its answer applies.
    public var listRequest = 0
    public var phase: Phase = .idle
    public var recordingID: String?
    public var failure: Failure?

    public var callsFolder: URL?
    /// No folder move holds the calls folder: false from the claim's grant until its release.
    public var callsFolderAvailable = true
    /// The calls-folder claim's token while a move holds it.
    public var moveToken: UInt64?
    public var stopping = false
    /// Stopping, with no folder move holding the calls folder and no merge, restore or transcript run running: storage has settled for quit.
    public var stopped = false
    public var move: CallsFolderMove?
    /// The calls chosen to merge, while merging.
    public var mergeSelection: Set<String> = []
    /// The call the last merge made, to be selected in the list.
    public var mergedCallID: String?
    /// Audelin is idle enough to merge or make a transcript again, as compose last said; not until it says so.
    public var mergeAvailable = false
    /// The tags save under way, one at a time.
    public var tagsSave: TagsSave?
    /// How the last tags request ended, echoing its request id, for the list to apply.
    public var tagsOutcome: TagsOutcome?
    public var transcriptOffers: [String: TranscriptOffers]
    public var transcriptRun: TranscriptRun?
    public var transcriptRequest: Int
    public var selectedCallID: String?
    /// A distinct value for each made or restored transcript, even for the same call.
    public var transcriptChanged: TranscriptChange?

    public struct TagsSave: Equatable, Sendable {
        public let request: Int
        public let id: String
        public let tags: [String]
        public init(request: Int, id: String, tags: [String]) { self.request = request; self.id = id; self.tags = tags }
    }

    public struct TagsOutcome: Equatable, Sendable {
        public enum Result: Equatable, Sendable { case saved, failed(String) }
        public let request: Int
        public let id: String
        public let result: Result
        public init(request: Int, id: String, result: Result) { self.request = request; self.id = id; self.result = result }
    }

    public init(calls: [RecordedCall] = [], isListing: Bool = false, listRequest: Int = 0, phase: Phase = .idle,
                recordingID: String? = nil, failure: Failure? = nil, callsFolder: URL? = nil,
                callsFolderAvailable: Bool = true, moveToken: UInt64? = nil, stopping: Bool = false, stopped: Bool = false, move: CallsFolderMove? = nil,
                mergeSelection: Set<String> = [], mergedCallID: String? = nil, mergeAvailable: Bool = false,
                tagsSave: TagsSave? = nil, tagsOutcome: TagsOutcome? = nil,
                transcriptOffers: [String: TranscriptOffers] = [:], transcriptRun: TranscriptRun? = nil,
                transcriptRequest: Int = 0, selectedCallID: String? = nil, transcriptChanged: TranscriptChange? = nil) {
        self.calls = calls; self.isListing = isListing; self.listRequest = listRequest; self.phase = phase; self.recordingID = recordingID
        self.failure = failure; self.callsFolder = callsFolder; self.callsFolderAvailable = callsFolderAvailable; self.moveToken = moveToken; self.stopping = stopping; self.stopped = stopped; self.move = move
        self.mergeSelection = mergeSelection; self.mergedCallID = mergedCallID; self.mergeAvailable = mergeAvailable
        self.tagsSave = tagsSave; self.tagsOutcome = tagsOutcome
        self.transcriptOffers = transcriptOffers; self.transcriptRun = transcriptRun
        self.transcriptRequest = transcriptRequest; self.selectedCallID = selectedCallID; self.transcriptChanged = transcriptChanged
    }
}

public enum RecordingsEvent: Equatable, Sendable {
    case makeTranscriptAgain(String), cancelTranscriptAgain
    case transcriptReported(request: Int, TranscriptReport)
    /// Recording starts are separate from the idle value, which only admits requests.
    case recordingStarted
    case restorePreviousTranscript(String)
    case transcriptRestored(String), transcriptRestoreFailed(id: String, reason: String)
    case stopActions
    /// A list answer names the request it answers.
    case refresh, clearFailure, listed(request: Int, [RecordedCall]), listFailed(request: Int, String)
    case recordingChanged(String?)
    case rename(id: String, title: String), renamed(String), renameFailed(id: String, reason: String)
    case chooseFolder(URL), movePrepared([MoveCall]), movePreparationFailed(String)
    /// The claim's token for the move, or nil when another holder has the calls folder.
    case confirmMove, retryMove, cancelMove, moveReserved(token: UInt64?), moveReleased
    case callMoved(id: String, bytes: Int64), callMoveFailed(id: String, reason: String)
    case folderStored, folderStoreFailed(String)
    case askDelete(String), confirmDelete, cancelDelete, deleted(String), deleteFailed(id: String, reason: String)
    case enterMergeMode, leaveMergeMode, toggleMergeSelection(String)
    case confirmMerge, mergeAnyway, goBackFromWarning, merged(String), mergeFailed(String)
    /// Whether Audelin is idle enough to merge, sent whenever it changes.
    case mergeAvailability(Bool)
    /// Sets a call's tags under the caller's request id, which the outcome echoes.
    case setTags(request: Int, id: String, tags: [String])
    case tagsSet(request: Int, id: String), tagsSetFailed(request: Int, id: String, reason: String)
}

public enum RecordingsEffect: Equatable, Sendable {
    case restorePreviousTranscript(String)
    case makeTranscriptAgain(id: String, request: Int), stopTranscriptAgain(id: String, request: Int)
    case prepareMove(URL), reserveMove, releaseMove(token: UInt64), moveCall(id: String, to: URL), storeFolder(URL)
    /// Lists the calls under a new request id.
    case list(request: Int), rename(id: String, title: String), delete(String)
    /// The calls to merge, in list order.
    case merge([String])
    case setTags(request: Int, id: String, tags: [String])
}

public struct RecordingsReducer: Sendable {
    private let failureMessage: @Sendable (String, String) -> String

    let moveText: @Sendable (CallsFolderMove) -> MoveText
    let transcriptMessage: @Sendable (TranscriptRefusal) -> String
    private let busyMessage: @Sendable () -> String

    /// `busyMessage` says Audelin is not idle enough to merge, or that a move or merge holds the calls.
    /// `transcriptMessage` renders transcript offers and refusals from their exact reasons.
    public init(failureMessage: @escaping @Sendable (String, String) -> String, moveText: @escaping @Sendable (CallsFolderMove) -> MoveText,
                busyMessage: @escaping @Sendable () -> String,
                transcriptMessage: @escaping @Sendable (TranscriptRefusal) -> String) {
        self.failureMessage = failureMessage
        self.moveText = moveText
        self.busyMessage = busyMessage
        self.transcriptMessage = transcriptMessage
    }

    public func reduce(_ state: RecordingsState, _ event: RecordingsEvent) -> (RecordingsState, RecordingsEffect?) {
        var (next, effect) = reduceEvent(state, event)
        updateTranscriptOffers(&next)
        switch next.phase {
        case .reservingMove, .releasingMove, .runningMerge, .restoring: break
        default:
            if next.stopping, next.transcriptRun == nil, next.moveToken == nil, next.tagsSave == nil { next.stopped = true }
        }
        return (next, effect)
    }

    private func reduceEvent(_ state: RecordingsState, _ event: RecordingsEvent) -> (RecordingsState, RecordingsEffect?) {
        if let result = reduceTranscript(state, event) { return result }
        if let result = reduceMove(state, event) { return result }
        var state = state
        switch event {
        case .stopActions:
            state.stopping = true
        case let .mergeAvailability(available):
            state.mergeAvailable = available
        case let .recordingChanged(id):
            state.recordingID = id
            if id == nil, state.phase == .refusedMove { state.phase = .idle; state.move = nil }
        case .clearFailure:
            switch state.phase {
            case .idle, .askingDelete: state.failure = nil
            default: return (state, nil)
            }
        case .refresh:
            guard state.phase == .idle, !state.isListing else { return (state, nil) }
            state.failure = nil
            let list = Self.requestList(&state)
            return (state, list)
        case let .listed(request, calls):
            guard state.isListing, request == state.listRequest else { return (state, nil) }
            state.calls = calls
            state.isListing = false
        case let .listFailed(request, reason):
            guard state.isListing, request == state.listRequest else { return (state, nil) }
            state.isListing = false
            if let failure = state.failure {
                state.failure = .init(id: failure.id, reason: failureMessage(failure.reason, reason), kind: failure.kind)
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
            let list = Self.requestList(&state)
            return (state, list)
        case let .renameFailed(id, reason):
            guard state.phase == .renaming(id) else { return (state, nil) }
            // The disk can differ from the list after a failed mutation: reload it,
            // keeping the reason until the next action.
            state.phase = .idle
            state.failure = .init(id: id, reason: reason)
            let list = Self.requestList(&state)
            return (state, list)
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
            let list = Self.requestList(&state)
            return (state, list)
        case let .deleteFailed(id, reason):
            guard state.phase == .deleting(id) else { return (state, nil) }
            // The disk can differ from the list after a failed mutation: reload it,
            // keeping the reason until the next action.
            state.phase = .idle
            state.failure = .init(id: id, reason: reason)
            let list = Self.requestList(&state)
            return (state, list)
        case .enterMergeMode:
            guard Self.acceptsAction(state) else { return (state, nil) }
            guard state.mergeAvailable else {
                state.failure = .init(id: nil, reason: busyMessage())
                return (state, nil)
            }
            state.phase = .merging
            state.mergeSelection = []
            state.mergedCallID = nil
            state.failure = nil
        case .leaveMergeMode:
            guard state.phase == .merging else { return (state, nil) }
            state.phase = .idle
            state.mergeSelection = []
        case let .toggleMergeSelection(id):
            guard state.phase == .merging, state.calls.contains(where: { $0.id == id }) else { return (state, nil) }
            if state.mergeSelection.remove(id) == nil { state.mergeSelection.insert(id) }
        case .confirmMerge:
            guard state.phase == .merging, state.mergeSelection.count >= 2 else { return (state, nil) }
            if Self.farApart(state.calls, selected: state.mergeSelection) {
                state.phase = .warnedFarApart
                return (state, nil)
            }
            return startMerge(state)
        case .mergeAnyway:
            guard state.phase == .warnedFarApart else { return (state, nil) }
            return startMerge(state)
        case .goBackFromWarning:
            guard state.phase == .warnedFarApart else { return (state, nil) }
            state.phase = .merging
        case let .merged(id):
            guard state.phase == .runningMerge else { return (state, nil) }
            state.phase = .idle
            state.mergeSelection = []
            state.mergedCallID = id
            let list = Self.requestList(&state)
            return (state, list)
        case let .setTags(request, id, tags):
            guard Self.admitsTags(state) else {
                state.tagsOutcome = .init(request: request, id: id, result: .failed(busyMessage()))
                return (state, nil)
            }
            state.tagsSave = .init(request: request, id: id, tags: tags)
            state.tagsOutcome = nil
            return (state, .setTags(request: request, id: id, tags: tags))
        case let .tagsSet(request, id):
            guard state.tagsSave?.request == request else { return (state, nil) }
            state.tagsSave = nil
            state.tagsOutcome = .init(request: request, id: id, result: .saved)
            // A list requested before the save can hold the old tags: only a fresh one applies.
            let list = Self.requestList(&state)
            return (state, list)
        case let .tagsSetFailed(request, id, reason):
            guard state.tagsSave?.request == request else { return (state, nil) }
            state.tagsSave = nil
            state.tagsOutcome = .init(request: request, id: id, result: .failed(reason))
        case let .mergeFailed(reason):
            guard state.phase == .runningMerge else { return (state, nil) }
            state.phase = .merging
            state.failure = .init(id: nil, reason: reason)
        default: break
        }
        return (state, nil)
    }

    private func startMerge(_ state: RecordingsState) -> (RecordingsState, RecordingsEffect?) {
        var state = state
        guard !state.stopping, state.mergeAvailable else {
            state.phase = .merging
            state.failure = .init(id: nil, reason: busyMessage())
            return (state, nil)
        }
        state.phase = .runningMerge
        state.failure = nil
        return (state, .merge(state.calls.map(\.id).filter(state.mergeSelection.contains)))
    }

    /// Selected calls are far apart when an unselected call of the whole list lies between two of them.
    public static func farApart(_ calls: [RecordedCall], selected: Set<String>) -> Bool {
        let places = calls.indices.filter { selected.contains(calls[$0].id) }
        guard let first = places.first, let last = places.last else { return false }
        return last - first + 1 > places.count
    }

    /// Asks for a fresh list under a new request id, so an answer to an earlier one never applies.
    static func requestList(_ state: inout RecordingsState) -> RecordingsEffect {
        state.isListing = true
        state.listRequest += 1
        return .list(request: state.listRequest)
    }

    /// A tags write is admitted while no move or merge holds the calls and no other save runs.
    static func admitsTags(_ state: RecordingsState) -> Bool {
        guard !state.stopping, state.tagsSave == nil, state.moveToken == nil, state.callsFolderAvailable else { return false }
        switch state.phase {
        case .idle, .askingDelete, .renaming, .deleting, .merging, .warnedFarApart: return true
        default: return false
        }
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
    private let transcriptAgain: any RecordingsTranscriptAgain
    private let calls: any RecordingsCalls
    private let reserve: @Sendable () async -> UInt64?
    private let release: @Sendable (UInt64) async -> Void
    private let storeFolder: @Sendable (URL) async throws -> Void
    private let describe: @Sendable (any Error) -> String
    /// `reserve` takes the calls-folder claim for a move, answering its token or nil when refused;
    /// `release` lets that token go. `describe` writes the sentence a failure shows, in the language the UI chose.
    public init(calls: any RecordingsCalls, transcriptAgain: any RecordingsTranscriptAgain, reserve: @escaping @Sendable () async -> UInt64?,
                release: @escaping @Sendable (UInt64) async -> Void, storeFolder: @escaping @Sendable (URL) async throws -> Void,
                describe: @escaping @Sendable (any Error) -> String) {
        self.transcriptAgain = transcriptAgain
        self.calls = calls; self.reserve = reserve; self.release = release; self.storeFolder = storeFolder; self.describe = describe
    }

    public func handle(_ effect: RecordingsEffect) -> AsyncStream<RecordingsEvent> {
        AsyncStream { output in
            let task = Task {
                switch effect {
                case let .makeTranscriptAgain(id, request):
                    for await report in transcriptAgain.run(id: id, request: request) {
                        output.yield(.transcriptReported(request: request, report))
                    }
                case let .stopTranscriptAgain(id, request):
                    await transcriptAgain.stop(id: id, request: request)
                default: output.yield(await perform(effect))
                }
                output.finish()
            }
            output.onTermination = { _ in task.cancel() }
        }
    }

    private func perform(_ effect: RecordingsEffect) async -> RecordingsEvent {
        switch effect {
        case let .restorePreviousTranscript(id):
            do { try await calls.restorePreviousTranscript(id: id); return .transcriptRestored(id) }
            catch { return .transcriptRestoreFailed(id: id, reason: describe(error)) }
        case .makeTranscriptAgain, .stopTranscriptAgain: preconditionFailure("Streaming effects are dispatched by handle")
        case .reserveMove: return .moveReserved(token: await reserve())
        case let .releaseMove(token): await release(token); return .moveReleased
        case let .prepareMove(destination):
            do { return .movePrepared(try await calls.prepareMove(to: destination)) }
            catch { return .movePreparationFailed(describe(error)) }
        case let .moveCall(id, destination):
            do { return .callMoved(id: id, bytes: try await calls.move(id: id, to: destination)) }
            catch { return .callMoveFailed(id: id, reason: describe(error)) }
        case let .storeFolder(destination):
            do { try await storeFolder(destination); return .folderStored }
            catch { return .folderStoreFailed(describe(error)) }
        case let .list(request):
            do { return .listed(request: request, try await calls.list()) }
            catch { return .listFailed(request: request, describe(error)) }
        case let .rename(id, title):
            do { try await calls.rename(id: id, title: title); return .renamed(id) }
            catch { return .renameFailed(id: id, reason: describe(error)) }
        case let .delete(id):
            do { try await calls.delete(id: id); return .deleted(id) }
            catch { return .deleteFailed(id: id, reason: describe(error)) }
        case let .merge(ids):
            do { return .merged(try await calls.merge(ids: ids)) }
            catch { return .mergeFailed(describe(error)) }
        case let .setTags(request, id, tags):
            do { try await calls.setTags(id: id, tags: tags); return .tagsSet(request: request, id: id) }
            catch { return .tagsSetFailed(request: request, id: id, reason: describe(error)) }
        }
    }
}
