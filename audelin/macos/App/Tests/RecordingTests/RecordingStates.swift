import Recording

func makeState(_ state: RecordingState, _ configure: (inout RecordingState) -> Void) -> RecordingState {
    var state = state
    configure(&state)
    return state
}

func makeUnknown() -> RecordingState { RecordingState() }
func makeIdle() -> RecordingState { RecordingState(automatic: true, missing: []) }
func makeBeginning(id: UInt64 = 1) -> RecordingState {
    makeState(makeIdle()) {
        $0.phase = .beginning
        $0.session = .init(id: id, origin: .hand)
        $0.lastSessionID = id
    }
}
func makeRunning(id: UInt64 = 1) -> RecordingState { makeState(makeBeginning(id: id)) { $0.phase = .recording } }
func makeEnding(id: UInt64 = 1) -> RecordingState { makeState(makeRunning(id: id)) { $0.phase = .ending } }
func makePending() -> RecordingState { makeState(makeEnding()) { $0.callOn = true; $0.pendingCall = true } }
func makeCall() -> RecordingState {
    makeState(makeBeginning()) {
        $0.callOn = true
        $0.sessionBeganDuringCall = true
        $0.session = .init(id: 1, origin: .call)
    }
}
func makeFailed() -> RecordingState { makeState(makeEnding()) { $0.cannotRecord = "cannot keep audio" } }
func makeEnded() -> RecordingState { makeState(makeIdle()) { $0.lastSessionID = 1; $0.cannotRecord = "cannot keep audio" } }
func makeBlocked(_ condition: RecordingCondition) -> RecordingState { makeState(makeIdle()) { $0.missing = [condition] } }
func makeIdleAfter(_ id: UInt64) -> RecordingState { makeState(RecordingState(missing: [])) { $0.lastSessionID = id } }
func makeFailedAfter(_ id: UInt64) -> RecordingState { makeState(makeIdleAfter(id)) { $0.cannotRecord = "cannot keep audio" } }
func makeReserved() -> RecordingState { makeState(makeIdle()) { $0.storageReserved = true } }

func makeQueued(_ origin: RecordingState.Origin) -> RecordingState {
    makeState(makeReserved()) {
        $0.pendingStart = origin
        $0.callOn = origin == .call
    }
}

func makeQueuedWithoutFolder() -> RecordingState { makeState(makeQueued(.hand)) { $0.missing = [.callsFolder] } }

/// Session 2, begun for the call that came while session 1 was ending.
func makeDeferredCall() -> RecordingState {

    makeState(makeBeginning(id: 2)) {
        $0.session = .init(id: 2, origin: .call)
        $0.callOn = true
        $0.sessionBeganDuringCall = true
    }
}
