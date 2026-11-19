import Foundation

public struct MissingRecordingTrack: Equatable, Sendable {
    public enum Track: Equatable, Sendable { case microphone, call }
    public var id: String
    public var track: Track
    public init(id: String, track: Track) { self.id = id; self.track = track }
}

public enum TranscriptRefusal: Equatable, Sendable {
    case notIdle, actionUnderWay, noPreviousTranscript, callNotFound, recordingStarted
    case missingTracks([MissingRecordingTrack])
    case runningTranscript(id: String)
}

public enum TranscriptOffer: Equatable, Sendable {
    case available
    case unavailable(TranscriptRefusal, message: String)
}

public struct TranscriptOffers: Equatable, Sendable {
    public var run: TranscriptOffer
    public var restore: TranscriptOffer
    public init(run: TranscriptOffer, restore: TranscriptOffer) { self.run = run; self.restore = restore }
}

public enum TranscriptWait: Equatable, Sendable { case preparing, hearing(Double), finishing }
public enum TranscriptReport: Equatable, Sendable {
    case waiting(TranscriptWait), made, stopped, failed(String)
}

public struct TranscriptRun: Equatable, Sendable {
    public enum StopReason: Equatable, Sendable { case cancelled, recordingStarted, shutdown }
    public var id: String
    public var request: Int
    public var wait: TranscriptWait
    public var stopReason: StopReason?
    public init(id: String, request: Int, wait: TranscriptWait = .preparing, stopReason: StopReason? = nil) {
        self.id = id; self.request = request; self.wait = wait; self.stopReason = stopReason
    }
}

public struct TranscriptChange: Equatable, Sendable {
    public var id: String
    public var request: Int
    public init(id: String, request: Int) { self.id = id; self.request = request }
}

/// Each run reports its waits and exactly one terminal outcome, then ends its stream.
/// The request identifies a run across retries, so a delayed stop cannot stop its successor.
/// A stop asks the same run to end; its terminal report decides whether publication won.
public protocol RecordingsTranscriptAgain: Sendable {
    func run(id: String, request: Int) -> AsyncStream<TranscriptReport>
    func stop(id: String, request: Int) async
}

extension RecordingsReducer {
    func reduceTranscript(_ given: RecordingsState, _ event: RecordingsEvent) -> (RecordingsState, RecordingsEffect?)? {
        var state = given
        if case .restoring = state.phase {
            let id: String?
            switch event {
            case let .rename(call, _), let .askDelete(call), let .makeTranscriptAgain(call), let .restorePreviousTranscript(call): id = call
            case .confirmDelete, .enterMergeMode, .confirmMerge, .mergeAnyway, .chooseFolder, .confirmMove, .retryMove: id = nil
            default: return reduceRestoreOutcome(state, event)
            }
            state.failure = .init(id: id, reason: transcriptMessage(.actionUnderWay))
            return (state, nil)
        }
        switch event {
        case let .restorePreviousTranscript(id):
            if let refusal = restoreRefusal(state, id: id) {
                state.failure = .init(id: id, reason: transcriptMessage(refusal))
                return (state, nil)
            }
            state.phase = .restoring(id)
            state.transcriptRequest += 1
            state.selectedCallID = id
            state.failure = nil
            return (state, .restorePreviousTranscript(id))
        case let .makeTranscriptAgain(id):
            if let refusal = runRefusal(state, id: id) {
                state.failure = .init(id: id, reason: transcriptMessage(refusal))
                return (state, nil)
            }
            state.transcriptRequest += 1
            state.transcriptRun = .init(id: id, request: state.transcriptRequest)
            state.selectedCallID = id
            state.failure = nil
            return (state, .makeTranscriptAgain(id: id, request: state.transcriptRequest))
        case .cancelTranscriptAgain, .recordingStarted, .stopActions:
            if event == .stopActions { state.stopping = true }
            guard var run = state.transcriptRun else {
                return event == .recordingStarted || event == .cancelTranscriptAgain ? (state, nil) : nil
            }
            let alreadyAsked = run.stopReason != nil
            if event == .recordingStarted { run.stopReason = .recordingStarted }
            else if !alreadyAsked { run.stopReason = event == .stopActions ? .shutdown : .cancelled }
            state.transcriptRun = run
            return (state, alreadyAsked ? nil : .stopTranscriptAgain(id: run.id, request: run.request))
        case let .transcriptReported(request, report):
            guard let run = state.transcriptRun, run.request == request else { return (state, nil) }
            switch report {
            case let .waiting(wait): state.transcriptRun?.wait = wait
            case .made:
                state.transcriptRun = nil
                state.selectedCallID = run.id
                state.failure = nil
                state.transcriptChanged = .init(id: run.id, request: request)
                let list = Self.requestList(&state)
                return (state, list)
            case .stopped, .failed:
                state.transcriptRun = nil
                state.selectedCallID = run.id
                if run.stopReason == .recordingStarted {
                    state.failure = .init(id: run.id, reason: transcriptMessage(.recordingStarted), kind: .transcriptStopped)
                } else if case let .failed(reason) = report {
                    state.failure = .init(id: run.id, reason: reason, kind: .transcriptRun)
                } else { state.failure = nil }
            }
            return (state, nil)
        default: break
        }
        guard let run = state.transcriptRun else { return nil }
        let locked: Bool
        let id: String?
        switch event {
        case let .rename(call, _), let .askDelete(call): id = call; locked = call == run.id
        case .confirmDelete:
            if case let .askingDelete(call) = state.phase { id = call; locked = call == run.id }
            else { return nil }
        case let .restorePreviousTranscript(call): id = call; locked = true
        case .enterMergeMode, .confirmMerge, .mergeAnyway, .chooseFolder, .confirmMove, .retryMove:
            id = nil; locked = true
        default: return nil
        }
        guard locked else { return nil }
        state.failure = .init(id: id, reason: transcriptMessage(.runningTranscript(id: run.id)))
        return (state, nil)
    }

    private func reduceRestoreOutcome(_ given: RecordingsState, _ event: RecordingsEvent) -> (RecordingsState, RecordingsEffect?)? {
        var state = given
        switch event {
        case let .transcriptRestored(id):
            guard state.phase == .restoring(id) else { return (state, nil) }
            state.phase = .idle
            state.selectedCallID = id
            state.failure = nil
            state.transcriptChanged = .init(id: id, request: state.transcriptRequest)
            let list = Self.requestList(&state)
            return (state, list)
        case let .transcriptRestoreFailed(id, reason):
            guard state.phase == .restoring(id) else { return (state, nil) }
            state.phase = .idle
            state.selectedCallID = id
            state.failure = .init(id: id, reason: reason, kind: .transcriptRestore)
            return (state, nil)
        default: return nil
        }
    }

    private func restoreRefusal(_ state: RecordingsState, id: String) -> TranscriptRefusal? {
        if let run = state.transcriptRun { return .runningTranscript(id: run.id) }
        guard let call = state.calls.first(where: { $0.id == id }) else { return .callNotFound }
        guard call.hasPreviousTranscript else { return .noPreviousTranscript }
        return actionRefusal(state)
    }

    private func actionRefusal(_ state: RecordingsState) -> TranscriptRefusal? {
        if let run = state.transcriptRun { return .runningTranscript(id: run.id) }
        if !state.mergeAvailable || state.recordingID != nil { return .notIdle }
        if state.stopping || state.isListing || state.phase != .idle || state.move != nil ||
            state.moveToken != nil || !state.callsFolderAvailable || state.tagsSave != nil { return .actionUnderWay }
        return nil
    }

    private func runRefusal(_ state: RecordingsState, id: String) -> TranscriptRefusal? {
        guard let call = state.calls.first(where: { $0.id == id }) else { return .callNotFound }
        return runRefusal(call, busy: actionRefusal(state))
    }

    private func runRefusal(_ call: RecordedCall, busy: TranscriptRefusal?) -> TranscriptRefusal? {
        call.missingTracks.isEmpty ? busy : .missingTracks(call.missingTracks)
    }

    func updateTranscriptOffers(_ state: inout RecordingsState) {
        let previous = state.transcriptOffers
        let busy = actionRefusal(state)
        state.transcriptOffers = Dictionary(uniqueKeysWithValues: state.calls.map { call in
            let run = runRefusal(call, busy: busy)
            let restore: TranscriptRefusal? = call.hasPreviousTranscript ? busy : .noPreviousTranscript
            return (call.id, TranscriptOffers(run: offer(run, previous: previous[call.id]?.run),
                                              restore: offer(restore, previous: previous[call.id]?.restore)))
        })
    }

    private func offer(_ reason: TranscriptRefusal?, previous: TranscriptOffer?) -> TranscriptOffer {
        guard let reason else { return .available }
        if let previous, case let .unavailable(prior, _) = previous, prior == reason { return previous }
        return .unavailable(reason, message: transcriptMessage(reason))
    }
}
