import Recording
import Testing

struct RecordingMoveTests {
    @Test(arguments: [RecordingEvent.userStart, .callStarted])
    func startsDuringAMoveWaitForRelease(event: RecordingEvent) {
        let given = makeState()
        assert(given, .reserveStorage) { $0.storageReserved = true }
        let reserved = makeState { $0.storageReserved = true }
        assert(reserved, event) {
            $0.pendingStart = event == .userStart ? .hand : .call
            if event == .callStarted { $0.callOn = true }
        }
        let pending = makeState { $0.storageReserved = true; $0.pendingStart = event == .userStart ? .hand : .call; $0.callOn = event == .callStarted }
        assert(pending, .releaseStorage) {
            $0.storageReserved = false; $0.pendingStart = nil; $0.phase = .beginning
            $0.lastSessionID = 1; $0.session = .init(id: 1, origin: event == .userStart ? .hand : .call)
            $0.sessionBeganDuringCall = event == .callStarted
        }
    }
    @Test func releaseStillWaitsForTheFolderAndStopCancelsThePendingStart() {
        let pending = makeState { $0.storageReserved = true; $0.pendingStart = .hand; $0.missing = [.callsFolder] }
        assert(pending, .releaseStorage) { $0.storageReserved = false }
        assert(pending, .userStop) { $0.pendingStart = nil }
        assert(pending, .conditionChanged(.callsFolder, available: true)) { $0.missing = [] }
        let released = makeState { $0.pendingStart = .hand; $0.missing = [.callsFolder] }
        assert(released, .conditionChanged(.callsFolder, available: true)) {
            $0.missing = []; $0.pendingStart = nil; $0.phase = .beginning
            $0.lastSessionID = 1; $0.session = .init(id: 1, origin: .hand)
        }
    }
    @Test func anAutomaticStartCannotReplaceAQueuedManualStart() {
        let manual = makeState { $0.storageReserved = true; $0.pendingStart = .hand }
        assert(manual, .callStarted) { $0.callOn = true }
        let callOn = makeState { $0.storageReserved = true; $0.pendingStart = .hand; $0.callOn = true }
        assert(callOn, .callEnded) { $0.callOn = false }
        assert(callOn, .automaticChanged(false)) { $0.automatic = false }
    }
    @Test func endingTheCallOrDisablingAutomaticCancelsItsPendingStart() {
        let pending = makeState { $0.storageReserved = true; $0.pendingStart = .call; $0.callOn = true }
        assert(pending, .callEnded) { $0.callOn = false; $0.pendingStart = nil }
        assert(pending, .automaticChanged(false)) { $0.automatic = false; $0.pendingStart = nil }
        let recording = makeState { $0.phase = .recording; $0.session = .init(id: 1, origin: .hand); $0.lastSessionID = 1 }
        assert(recording, .reserveStorage)
    }
}
private func makeState(_ change: (inout RecordingState) -> Void = { _ in }) -> RecordingState {
    var state = RecordingState(automatic: true, missing: []); change(&state); return state
}
