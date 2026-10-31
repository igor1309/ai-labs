import Foundation
import Session
import Testing

extension SessionReducerTests {

    // MARK: Live text

    @Test(arguments: LiveTextChange.allCases, [true, false])
    func liveTextChangeWhileRecordingSendsIt_state(_ change: LiveTextChange, _ enabled: Bool) {

        let state = recording()
        assert(state, change.event(enabled), reducedTo: state.with {
            $0.wantedLiveText = enabled
            $0.liveTextRequestID = state.liveTextRequestID + 1
            $0.pendingLiveText = .init(id: state.liveTextRequestID + 1, enabled: enabled)
        })
    }

    @Test(arguments: LiveTextChange.allCases, [true, false])
    func liveTextChangeWhileRecordingSendsIt_effect(_ change: LiveTextChange, _ enabled: Bool) {

        let state = recording()
        assert(state, change.event(enabled), effect: .setLiveText(.init(id: state.liveTextRequestID + 1, enabled: enabled)))
    }

    @Test(arguments: LiveTextChange.allCases, [true, false])
    func liveTextChangeWhileOneIsHeldOnlyBumpsTheID_state(_ change: LiveTextChange, _ enabled: Bool) {

        let state = holdingLiveText()
        assert(state, change.event(enabled), reducedTo: state.with {
            $0.wantedLiveText = enabled
            $0.liveTextRequestID = state.liveTextRequestID + 1
        })
    }

    @Test(arguments: LiveTextChange.allCases, [true, false])
    func liveTextChangeWhileOneIsHeldOnlyBumpsTheID_effect(_ change: LiveTextChange, _ enabled: Bool) {

        assert(holdingLiveText(), change.event(enabled), effect: nil)
    }

    @Test(arguments: results)
    func replyToAnOlderRequestSendsTheNewerOne_state(_ error: String?) {

        let state = holdingLiveText(stale: true)
        assert(state, .liveTextSet(request: state.pendingLiveText!, error: error), reducedTo: state.with {
            $0.pendingLiveText = .init(id: state.liveTextRequestID, enabled: state.wantedLiveText)
        })
    }

    @Test(arguments: results)
    func replyToAnOlderRequestSendsTheNewerOne_effect(_ error: String?) {

        let state = holdingLiveText(stale: true)
        assert(state, .liveTextSet(request: state.pendingLiveText!, error: error), effect: .setLiveText(
            .init(id: state.liveTextRequestID, enabled: state.wantedLiveText)
        ))
    }

    @Test func replyToTheCurrentRequestReleasesIt_state() {

        let state = holdingLiveText()
        assert(state, .liveTextSet(request: state.pendingLiveText!, error: nil), reducedTo: state.with { $0.pendingLiveText = nil })
    }

    @Test func replyToTheCurrentRequestReleasesIt_effect() {

        let state = holdingLiveText()
        assert(state, .liveTextSet(request: state.pendingLiveText!, error: nil), effect: nil)
    }

    @Test func errorOnTheCurrentRequestIsRecorded_state() {

        let state = holdingLiveText()
        let error = anyError()
        assert(state, .liveTextSet(request: state.pendingLiveText!, error: error), reducedTo: state.with {
            $0.pendingLiveText = nil
            $0.fail(.callText, error)
        })
    }

    @Test func errorOnTheCurrentRequestIsRecorded_effect() {

        let state = holdingLiveText()
        assert(state, .liveTextSet(request: state.pendingLiveText!, error: anyError()), effect: nil)
    }

    @Test func replyToAnOlderRequestOnceRecordingHasStoppedSendsNothing_state() {

        let state = holdingLiveText(stale: true).with { $0.phase = .bringingUp }
        assert(state, .liveTextSet(request: state.pendingLiveText!, error: nil), reducedTo: state.with { $0.pendingLiveText = nil })
    }

    @Test func replyToAnOlderRequestOnceRecordingHasStoppedSendsNothing_effect() {

        let state = holdingLiveText(stale: true).with { $0.phase = .bringingUp }
        assert(state, .liveTextSet(request: state.pendingLiveText!, error: nil), effect: nil)
    }

    @Test func replyThatDoesNotMatchTheHeldRequestChangesNothing_state() {

        for (state, event) in unmatchedReplies() { assert(state, event, reducedTo: state) }
    }

    @Test func replyThatDoesNotMatchTheHeldRequestChangesNothing_effect() {

        for (state, event) in unmatchedReplies() { assert(state, event, effect: nil) }
    }

    @Test(arguments: liveTextHosts, liveTexts)
    func callTextStatusIsShownWhileWanted_state(_ host: LiveTextHost, _ status: SessionState.LiveText) {

        let state = hosting(host).with { $0.wantedLiveText = true }
        assert(state, .callTextStatusChanged(status), reducedTo: state.with { $0.liveText = status })
    }

    @Test(arguments: liveTextHosts, liveTexts)
    func callTextStatusIsShownWhileWanted_effect(_ host: LiveTextHost, _ status: SessionState.LiveText) {

        assert(hosting(host).with { $0.wantedLiveText = true }, .callTextStatusChanged(status), effect: nil)
    }

    @Test(arguments: liveTextHosts)
    func offIsShownWhenLiveTextIsNotWanted_state(_ host: LiveTextHost) {

        let state = hosting(host).with {
            $0.wantedLiveText = false
            $0.liveText = .on
        }
        assert(state, .callTextStatusChanged(.off), reducedTo: state.with { $0.liveText = .off })
    }

    @Test(arguments: liveTextHosts)
    func offIsShownWhenLiveTextIsNotWanted_effect(_ host: LiveTextHost) {

        let state = hosting(host).with {
            $0.wantedLiveText = false
            $0.liveText = .on
        }
        assert(state, .callTextStatusChanged(.off), effect: nil)
    }

    @Test(arguments: liveTextHosts, [SessionState.LiveText.gettingReady, .on])
    func readinessIsNotShownWhenLiveTextIsNotWanted_state(_ host: LiveTextHost, _ status: SessionState.LiveText) {

        let state = hosting(host).with {
            $0.wantedLiveText = false
            $0.liveText = .off
        }
        assert(state, .callTextStatusChanged(status), reducedTo: state)
    }

    @Test(arguments: liveTextHosts, [SessionState.LiveText.gettingReady, .on])
    func readinessIsNotShownWhenLiveTextIsNotWanted_effect(_ host: LiveTextHost, _ status: SessionState.LiveText) {

        let state = hosting(host).with {
            $0.wantedLiveText = false
            $0.liveText = .off
        }
        assert(state, .callTextStatusChanged(status), effect: nil)
    }

    // MARK: Access

    @Test(arguments: sides)
    func accessLostOnOneSideKeepsRecording_state(_ side: SessionSide) {

        let state = recording()
        assert(state, .accessChanged(side, available: false), reducedTo: state.with { $0.loseAccess(side) })
    }

    @Test(arguments: sides)
    func accessLostOnOneSideKeepsRecording_effect(_ side: SessionSide) {

        assert(recording(), .accessChanged(side, available: false), effect: nil)
    }

    @Test(arguments: sides)
    func accessLostOnBothSidesCannotRecord_state(_ side: SessionSide) {

        let state = recording().with { $0.loseAccess(side.other) }
        assert(state, .accessChanged(side, available: false), reducedTo: state.with {
            $0.loseAccess(side)
            $0.cannotRecord = "no track can record"
            $0.phase = .bringingUp
        })
    }

    @Test(arguments: sides)
    func accessLostOnBothSidesCannotRecord_effect(_ side: SessionSide) {

        let state = recording().with { $0.loseAccess(side.other) }
        assert(state, .accessChanged(side, available: false), effect: nil)
    }

    @Test(arguments: sides, bringUpOrder)
    func accessLostDuringBringUpKeepsThePieceStarting_state(_ side: SessionSide, _ piece: SessionState.Piece) {

        let state = bringingUp(starting: piece)
        assert(state, .accessChanged(side, available: false), reducedTo: state.with { $0.loseAccess(side) })
    }

    @Test(arguments: sides, bringUpOrder)
    func accessLostDuringBringUpKeepsThePieceStarting_effect(_ side: SessionSide, _ piece: SessionState.Piece) {

        assert(bringingUp(starting: piece), .accessChanged(side, available: false), effect: nil)
    }

    @Test(arguments: sides, stopOrder)
    func accessLostWhileEndingKeepsThePieceStopping_state(_ side: SessionSide, _ piece: SessionState.Piece) {

        let state = stopping(piece)
        assert(state, .accessChanged(side, available: false), reducedTo: state.with { $0.loseAccess(side) })
    }

    @Test(arguments: sides, stopOrder)
    func accessLostWhileEndingKeepsThePieceStopping_effect(_ side: SessionSide, _ piece: SessionState.Piece) {

        assert(stopping(piece), .accessChanged(side, available: false), effect: nil)
    }

    // MARK: Ignored events

    @Test func resultForAPieceNotInTheAwaitedStatusIsIgnored_state() {

        for (state, event) in resultsNotAwaited() { assert(state, event, reducedTo: state) }
    }

    @Test func resultForAPieceNotInTheAwaitedStatusIsIgnored_effect() {

        for (state, event) in resultsNotAwaited() { assert(state, event, effect: nil) }
    }

    @Test func eventInTheWrongPhaseIsIgnored_state() {

        for (state, event) in eventsInTheWrongPhase() { assert(state, event, reducedTo: state) }
    }

    @Test func eventInTheWrongPhaseIsIgnored_effect() {

        for (state, event) in eventsInTheWrongPhase() { assert(state, event, effect: nil) }
    }
}
