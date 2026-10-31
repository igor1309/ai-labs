import Foundation
import Session
import Testing

extension SessionReducerTests {

    // MARK: Live text

    @Test(arguments: LiveTextChange.allCases, [true, false])
    func liveTextChangeWhileRecordingSendsIt_state(_ change: LiveTextChange, _ enabled: Bool) {

        let state = makeRecording()
        assert(state, change.event(enabled)) {
            $0.wantedLiveText = enabled
            $0.liveTextRequestID = state.liveTextRequestID + 1
            $0.pendingLiveText = .init(id: state.liveTextRequestID + 1, enabled: enabled)
        }
    }

    @Test(arguments: LiveTextChange.allCases, [true, false])
    func liveTextChangeWhileRecordingSendsIt_effect(_ change: LiveTextChange, _ enabled: Bool) {

        let state = makeRecording()
        assert(state, change.event(enabled), delivers: .setLiveText(.init(id: state.liveTextRequestID + 1, enabled: enabled)))
    }

    @Test(arguments: LiveTextChange.allCases, [true, false])
    func liveTextChangeWhileOneIsHeldOnlyBumpsTheID_state(_ change: LiveTextChange, _ enabled: Bool) {

        let state = makeHoldingLiveText()
        assert(state, change.event(enabled)) {
            $0.wantedLiveText = enabled
            $0.liveTextRequestID = state.liveTextRequestID + 1
        }
    }

    @Test(arguments: LiveTextChange.allCases, [true, false])
    func liveTextChangeWhileOneIsHeldOnlyBumpsTheID_effect(_ change: LiveTextChange, _ enabled: Bool) {

        assert(makeHoldingLiveText(), change.event(enabled), delivers: nil)
    }

    @Test(arguments: results)
    func replyToAnOlderRequestSendsTheNewerOne_state(_ error: String?) {

        let state = makeHoldingLiveText(stale: true)
        assert(state, .liveTextSet(request: state.pendingLiveText!, error: error)) {
            $0.pendingLiveText = .init(id: state.liveTextRequestID, enabled: state.wantedLiveText)
        }
    }

    @Test(arguments: results)
    func replyToAnOlderRequestSendsTheNewerOne_effect(_ error: String?) {

        let state = makeHoldingLiveText(stale: true)
        assert(state, .liveTextSet(request: state.pendingLiveText!, error: error), delivers: .setLiveText(
            .init(id: state.liveTextRequestID, enabled: state.wantedLiveText)
        ))
    }

    @Test func replyToTheCurrentRequestReleasesIt_state() {

        let state = makeHoldingLiveText()
        assert(state, .liveTextSet(request: state.pendingLiveText!, error: nil)) { $0.pendingLiveText = nil }
    }

    @Test func replyToTheCurrentRequestReleasesIt_effect() {

        let state = makeHoldingLiveText()
        assert(state, .liveTextSet(request: state.pendingLiveText!, error: nil), delivers: nil)
    }

    @Test func errorOnTheCurrentRequestIsRecorded_state() {

        let state = makeHoldingLiveText()
        let error = anyError()
        assert(state, .liveTextSet(request: state.pendingLiveText!, error: error)) {
            $0.pendingLiveText = nil
            $0.fail(.callText, error)
        }
    }

    @Test func errorOnTheCurrentRequestIsRecorded_effect() {

        let state = makeHoldingLiveText()
        assert(state, .liveTextSet(request: state.pendingLiveText!, error: anyError()), delivers: nil)
    }

    @Test func replyToAnOlderRequestOnceRecordingHasStoppedSendsNothing_state() {

        let state = makeHoldingLiveText(stale: true).with { $0.phase = .bringingUp }
        assert(state, .liveTextSet(request: state.pendingLiveText!, error: nil)) { $0.pendingLiveText = nil }
    }

    @Test func replyToAnOlderRequestOnceRecordingHasStoppedSendsNothing_effect() {

        let state = makeHoldingLiveText(stale: true).with { $0.phase = .bringingUp }
        assert(state, .liveTextSet(request: state.pendingLiveText!, error: nil), delivers: nil)
    }

    @Test func replyThatDoesNotMatchTheHeldRequestChangesNothing_state() {

        for (state, event) in unmatchedReplies() { assert(state, event) }
    }

    @Test func replyThatDoesNotMatchTheHeldRequestChangesNothing_effect() {

        for (state, event) in unmatchedReplies() { assert(state, event, delivers: nil) }
    }

    @Test(arguments: liveTextHosts, liveTexts)
    func callTextStatusIsShownWhileWanted_state(_ host: LiveTextHost, _ status: SessionState.LiveText) {

        let state = makeHosting(host).with { $0.wantedLiveText = true }
        assert(state, .callTextStatusChanged(status)) { $0.liveText = status }
    }

    @Test(arguments: liveTextHosts, liveTexts)
    func callTextStatusIsShownWhileWanted_effect(_ host: LiveTextHost, _ status: SessionState.LiveText) {

        assert(makeHosting(host).with { $0.wantedLiveText = true }, .callTextStatusChanged(status), delivers: nil)
    }

    @Test(arguments: liveTextHosts)
    func offIsShownWhenLiveTextIsNotWanted_state(_ host: LiveTextHost) {

        let state = makeHosting(host).with {
            $0.wantedLiveText = false
            $0.liveText = .on
        }
        assert(state, .callTextStatusChanged(.off)) { $0.liveText = .off }
    }

    @Test(arguments: liveTextHosts)
    func offIsShownWhenLiveTextIsNotWanted_effect(_ host: LiveTextHost) {

        let state = makeHosting(host).with {
            $0.wantedLiveText = false
            $0.liveText = .on
        }
        assert(state, .callTextStatusChanged(.off), delivers: nil)
    }

    @Test(arguments: liveTextHosts, [SessionState.LiveText.gettingReady, .on])
    func readinessIsNotShownWhenLiveTextIsNotWanted_state(_ host: LiveTextHost, _ status: SessionState.LiveText) {

        let state = makeHosting(host).with {
            $0.wantedLiveText = false
            $0.liveText = .off
        }
        assert(state, .callTextStatusChanged(status))
    }

    @Test(arguments: liveTextHosts, [SessionState.LiveText.gettingReady, .on])
    func readinessIsNotShownWhenLiveTextIsNotWanted_effect(_ host: LiveTextHost, _ status: SessionState.LiveText) {

        let state = makeHosting(host).with {
            $0.wantedLiveText = false
            $0.liveText = .off
        }
        assert(state, .callTextStatusChanged(status), delivers: nil)
    }

    // MARK: Access

    @Test(arguments: sides)
    func accessLostOnOneSideKeepsRecording_state(_ side: SessionSide) {

        let state = makeRecording()
        assert(state, .accessChanged(side, available: false)) { $0.loseAccess(side) }
    }

    @Test(arguments: sides)
    func accessLostOnOneSideKeepsRecording_effect(_ side: SessionSide) {

        assert(makeRecording(), .accessChanged(side, available: false), delivers: nil)
    }

    @Test(arguments: sides)
    func accessLostOnBothSidesCannotRecord_state(_ side: SessionSide) {

        let state = makeRecording().with { $0.loseAccess(side.other) }
        assert(state, .accessChanged(side, available: false)) {
            $0.loseAccess(side)
            $0.cannotRecord = "no track can record"
            $0.phase = .bringingUp
        }
    }

    @Test(arguments: sides)
    func accessLostOnBothSidesCannotRecord_effect(_ side: SessionSide) {

        let state = makeRecording().with { $0.loseAccess(side.other) }
        assert(state, .accessChanged(side, available: false), delivers: nil)
    }

    @Test(arguments: sides, bringUpOrder)
    func accessLostDuringBringUpKeepsThePieceStarting_state(_ side: SessionSide, _ piece: SessionState.Piece) {

        let state = makeBringingUp(starting: piece)
        assert(state, .accessChanged(side, available: false)) { $0.loseAccess(side) }
    }

    @Test(arguments: sides, bringUpOrder)
    func accessLostDuringBringUpKeepsThePieceStarting_effect(_ side: SessionSide, _ piece: SessionState.Piece) {

        assert(makeBringingUp(starting: piece), .accessChanged(side, available: false), delivers: nil)
    }

    @Test(arguments: sides, stopOrder)
    func accessLostWhileEndingKeepsThePieceStopping_state(_ side: SessionSide, _ piece: SessionState.Piece) {

        let state = makeStopping(piece)
        assert(state, .accessChanged(side, available: false)) { $0.loseAccess(side) }
    }

    @Test(arguments: sides, stopOrder)
    func accessLostWhileEndingKeepsThePieceStopping_effect(_ side: SessionSide, _ piece: SessionState.Piece) {

        assert(makeStopping(piece), .accessChanged(side, available: false), delivers: nil)
    }

    // MARK: Ignored events

    @Test func resultForAPieceNotInTheAwaitedStatusIsIgnored_state() {

        for (state, event) in resultsNotAwaited() { assert(state, event) }
    }

    @Test func resultForAPieceNotInTheAwaitedStatusIsIgnored_effect() {

        for (state, event) in resultsNotAwaited() { assert(state, event, delivers: nil) }
    }

    @Test func eventInTheWrongPhaseIsIgnored_state() {

        for (state, event) in eventsInTheWrongPhase() { assert(state, event) }
    }

    @Test func eventInTheWrongPhaseIsIgnored_effect() {

        for (state, event) in eventsInTheWrongPhase() { assert(state, event, delivers: nil) }
    }
}
