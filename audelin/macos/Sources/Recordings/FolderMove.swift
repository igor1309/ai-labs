import Foundation

public struct MoveCall: Equatable, Sendable {
    public var id: String
    public var title: String
    public var bytes: Int64
    public init(id: String, title: String, bytes: Int64) { self.id = id; self.title = title; self.bytes = bytes }
}

public struct MoveText: Equatable, Sendable {
    public var title: String
    public var body: String
    public var detail: String
    public var moved: String
    public init(title: String, body: String, detail: String, moved: String) {
        self.title = title; self.body = body; self.detail = detail; self.moved = moved
    }
}

public struct CallsFolderMove: Equatable, Sendable {
    public var destination: URL
    public var remaining: [MoveCall]
    public var completed: [MoveCall]
    public var totalCalls: Int
    public var totalBytes: Int64
    public var movedBytes: Int64
    public var progress: Double
    public var text: MoveText
    public init(destination: URL, remaining: [MoveCall] = [], completed: [MoveCall] = [],
                totalCalls: Int = 0, totalBytes: Int64 = 0, movedBytes: Int64 = 0, progress: Double = 0,
                text: MoveText = .init(title: "", body: "", detail: "", moved: "")) {
        self.destination = destination; self.remaining = remaining; self.completed = completed
        self.totalCalls = totalCalls; self.totalBytes = totalBytes; self.movedBytes = movedBytes
        self.progress = progress; self.text = text
    }
}

extension RecordingsReducer {
    func reduceMove(_ given: RecordingsState, _ event: RecordingsEvent) -> (RecordingsState, RecordingsEffect?)? {
        var state = given
        switch event {
        case let .chooseFolder(destination):
            guard Self.acceptsAction(state) else { return (state, nil) }
            guard destination.standardizedFileURL.path != state.callsFolder?.standardizedFileURL.path else { return (state, nil) }
            guard state.recordingID == nil else { state.phase = .refusedMove; return (state, nil) }
            var move = CallsFolderMove(destination: destination)
            move.text = moveText(move)
            state.move = move
            state.failure = nil
            state.phase = .countingMove
            return (state, .prepareMove(destination))
        case let .movePrepared(calls):
            guard state.phase == .countingMove || state.phase == .preparingMove, var move = state.move else { return (state, nil) }
            let completed = Set(move.completed.map(\.id))
            move.remaining = calls.filter { !completed.contains($0.id) }.sorted { $0.id < $1.id }
            move.totalCalls = move.completed.count + move.remaining.count
            move.totalBytes = move.movedBytes + move.remaining.reduce(0) { $0 + $1.bytes }
            move.progress = move.totalCalls == 0 ? 0 : Double(move.completed.count) / Double(move.totalCalls)
            move.text = moveText(move)
            state.move = move
            if state.phase == .countingMove { state.phase = .askingMove; return (state, nil) }
            return advanceMove(state)
        case let .movePreparationFailed(reason):
            guard state.phase == .countingMove || state.phase == .preparingMove else { return (state, nil) }
            state.failure = .init(id: nil, reason: reason)
            if state.phase == .preparingMove {
                state.phase = .releasingMove
                return (state, .releaseMove)
            }
            state.phase = .countFailed
        case .confirmMove, .retryMove:
            if event == .retryMove, state.phase == .countFailed, !state.stopping, !state.isListing, let move = state.move {
                state.phase = .countingMove
                state.failure = nil
                return (state, .prepareMove(move.destination))
            }
            guard (event == .confirmMove && state.phase == .askingMove) || (event == .retryMove && state.phase == .failedMove), !state.stopping, !state.isListing, state.move != nil else { return (state, nil) }
            guard state.recordingID == nil else { state.phase = .refusedMove; return (state, nil) }
            state.phase = .reservingMove
            state.failure = nil
            state.callsFolderAvailable = false
            return (state, .reserveMove)
        case let .moveReserved(accepted):
            guard state.phase == .reservingMove, let move = state.move else { return (state, nil) }
            if !accepted {
                state.phase = .refusedMove
                state.callsFolderAvailable = true
                return (state, nil)
            }
            state.phase = .preparingMove
            return (state, .prepareMove(move.destination))
        case let .callMoved(id, bytes):
            guard state.phase == .moving, var move = state.move, move.remaining.first?.id == id else { return (state, nil) }
            var call = move.remaining.removeFirst()
            call.bytes = bytes
            move.completed.append(call)
            move.movedBytes += bytes
            move.totalBytes = move.movedBytes + move.remaining.reduce(0) { $0 + $1.bytes }
            move.progress = Double(move.completed.count) / Double(move.totalCalls)
            move.text = moveText(move)
            state.move = move
            return advanceMove(state)
        case let .callMoveFailed(id, reason):
            guard state.phase == .moving, state.move?.remaining.first?.id == id else { return (state, nil) }
            state.failure = .init(id: id, reason: reason)
            state.phase = .releasingMove
            return (state, .releaseMove)
        case let .folderStoreFailed(reason):
            guard state.phase == .storingFolder else { return (state, nil) }
            state.failure = .init(id: nil, reason: reason)
            state.phase = .releasingMove
            return (state, .releaseMove)
        case .folderStored:
            guard state.phase == .storingFolder, let move = state.move else { return (state, nil) }
            state.callsFolder = move.destination
            state.phase = .releasingMove
            return (state, .releaseMove)
        case .moveReleased:
            guard state.phase == .releasingMove else { return (state, nil) }
            state.callsFolderAvailable = true
            state.phase = state.failure == nil ? .idle : .failedMove
            if state.failure == nil { state.move = nil }
            state.isListing = true
            return (state, .list)
        case .cancelMove:
            guard [.askingMove, .countFailed, .failedMove, .refusedMove].contains(state.phase) else { return (state, nil) }
            state.phase = .idle
            state.move = nil
            state.failure = nil
        default: return nil
        }
        return (state, nil)
    }

    private func advanceMove(_ given: RecordingsState) -> (RecordingsState, RecordingsEffect?) {
        var state = given
        guard let move = state.move else { return (state, nil) }
        if let next = move.remaining.first {
            state.phase = .moving
            return (state, .moveCall(id: next.id, to: move.destination))
        }
        state.phase = .storingFolder
        return (state, .storeFolder(move.destination))
    }
}
