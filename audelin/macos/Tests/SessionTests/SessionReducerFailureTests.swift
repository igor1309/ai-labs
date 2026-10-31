import Foundation
import Session
import Testing

extension SessionReducerTests {

    // MARK: Failures keep pending work

    @Test(arguments: bringUpOrder.filter { $0 != .folder })
    func failureWhileAPieceStartsKeepsItStarting_state(_ piece: SessionState.Piece) {

        let state = bringingUp(starting: piece)
        let error = anyError()
        assert(state, .pieceFailed(piece, error: error), reducedTo: state.with { $0.fail(piece, error) })
    }

    @Test(arguments: bringUpOrder.filter { $0 != .folder })
    func failureWhileAPieceStartsKeepsItStarting_effect(_ piece: SessionState.Piece) {

        assert(bringingUp(starting: piece), .pieceFailed(piece, error: anyError()), effect: nil)
    }

    @Test func failureWhileTheFolderIsCreatedKeepsItStarting_state() {

        let state = bringingUp(starting: .folder)
        let error = anyError()
        assert(state, .pieceFailed(.folder, error: error), reducedTo: state.with {
            $0.fail(.folder, error)
            $0.cannotRecord = "folder: \(error)"
        })
    }

    @Test func failureWhileTheFolderIsCreatedKeepsItStarting_effect() {

        assert(bringingUp(starting: .folder), .pieceFailed(.folder, error: anyError()), effect: nil)
    }

    @Test func createdFolderAfterItsFailureStopsBringUp_state() {

        let state = bringingUp(starting: .folder).with { $0.fail(.folder, anyError()) }
        let folder = anyFolder()
        assert(state, .folderFinished(error: nil, folder: folder), reducedTo: state.with {
            $0.folder = .up
            $0.recordedFolder = folder
        })
    }

    @Test func createdFolderAfterItsFailureStopsBringUp_effect() {

        let state = bringingUp(starting: .folder).with { $0.fail(.folder, anyError()) }
        assert(state, .folderFinished(error: nil, folder: anyFolder()), effect: nil)
    }

    @Test(arguments: openingSteps)
    func heldResultAfterAFailureStillStartsTheNextPiece_state(_ step: OpeningStep) {

        let state = bringingUp(starting: step.piece).with { $0.fail(step.piece, anyError()) }
        assert(state, startResult(step.piece, error: nil), reducedTo: state.with {
            $0[status: step.piece] = .up
            $0[status: step.next] = .starting
        })
    }

    @Test(arguments: openingSteps)
    func heldResultAfterAFailureStillStartsTheNextPiece_effect(_ step: OpeningStep) {

        let state = bringingUp(starting: step.piece).with { $0.fail(step.piece, anyError()) }
        assert(state, startResult(step.piece, error: nil), effect: step.effect)
    }

    @Test func heldMicrophoneCaptureAfterAFailureStillStartsTheCallCapture_state() {

        let state = bringingUp(starting: .capture(.microphone)).with { $0.fail(.capture(.microphone), anyError()) }
        assert(state, .captureFinished(.microphone, error: nil), reducedTo: state.with {
            $0.microphoneCapture = .up
            $0.callCapture = .starting
        })
    }

    @Test func heldMicrophoneCaptureAfterAFailureStillStartsTheCallCapture_effect() {

        let selection = anySelection()
        let state = bringingUp(starting: .capture(.microphone)).with {
            $0.fail(.capture(.microphone), anyError())
            $0.processSelection = selection
        }
        assert(state, .captureFinished(.microphone, error: nil), effect: .startCallCapture(selection: .chosen(selection)))
    }

    @Test func heldCallCaptureAfterAFailureRecordsThenStopsIt_state() {

        let state = bringingUp(starting: .capture(.call)).with { $0.fail(.capture(.call), anyError()) }
        assert(state, .captureFinished(.call, error: nil), reducedTo: state.with {
            $0.callCapture = .stopping
            $0.phase = .recording
        })
    }

    @Test func heldCallCaptureAfterAFailureRecordsThenStopsIt_effect() {

        let state = bringingUp(starting: .capture(.call)).with { $0.fail(.capture(.call), anyError()) }
        assert(state, .captureFinished(.call, error: nil), effect: .stopCapture(.call))
    }

    @Test func failedMicrophoneCaptureStopsOnceTheCallCaptureIsUp_state() {

        let state = bringingUp(starting: .capture(.call)).with { $0.fail(.capture(.microphone), anyError()) }
        assert(state, .captureFinished(.call, error: nil), reducedTo: state.with {
            $0.callCapture = .up
            $0.microphoneCapture = .stopping
            $0.phase = .recording
        })
    }

    @Test func failedMicrophoneCaptureStopsOnceTheCallCaptureIsUp_effect() {

        let state = bringingUp(starting: .capture(.call)).with { $0.fail(.capture(.microphone), anyError()) }
        assert(state, .captureFinished(.call, error: nil), effect: .stopCapture(.microphone))
    }

    @Test(arguments: stopOrder)
    func failureWhileAPieceStopsKeepsItStopping_state(_ piece: SessionState.Piece) {

        let state = stopping(piece)
        let error = anyError()
        assert(state, .pieceFailed(piece, error: error), reducedTo: state.with { $0.fail(piece, error) })
    }

    @Test(arguments: stopOrder)
    func failureWhileAPieceStopsKeepsItStopping_effect(_ piece: SessionState.Piece) {

        assert(stopping(piece), .pieceFailed(piece, error: anyError()), effect: nil)
    }

    @Test(arguments: stopOrder)
    func heldStopAfterAFailureStillGoesOn_state(_ piece: SessionState.Piece) {

        let state = stopping(piece).with { $0.fail(piece, anyError()) }
        assert(state, stopResult(piece, error: nil), reducedTo: state.with {
            $0[status: piece] = .closed
            $0.goOn(after: piece)
        })
    }

    @Test(arguments: stopOrder)
    func heldStopAfterAFailureStillGoesOn_effect(_ piece: SessionState.Piece) {

        let state = stopping(piece).with { $0.fail(piece, anyError()) }
        assert(state, stopResult(piece, error: nil), effect: nextStopEffect(after: piece))
    }

    @Test(arguments: sides)
    func failedCaptureStopsBetweenOperations_state(_ side: SessionSide) {

        let state = recording()
        let error = anyError()
        assert(state, .pieceFailed(.capture(side), error: error), reducedTo: state.with {
            $0.fail(.capture(side), error)
            $0[status: .capture(side)] = .stopping
        })
    }

    @Test(arguments: sides)
    func failedCaptureStopsBetweenOperations_effect(_ side: SessionSide) {

        assert(recording(), .pieceFailed(.capture(side), error: anyError()), effect: .stopCapture(side))
    }

    @Test(arguments: sides)
    func failedCaptureWaitsForTheOtherCaptureToStop_state(_ side: SessionSide) {

        let state = recording().with { $0[status: .capture(side.other)] = .stopping }
        let error = anyError()
        assert(state, .pieceFailed(.capture(side), error: error), reducedTo: state.with {
            $0.fail(.capture(side), error)
            $0.cannotRecord = "no track can record"
            $0.phase = .bringingUp
        })
    }

    @Test(arguments: sides)
    func failedCaptureWaitsForTheOtherCaptureToStop_effect(_ side: SessionSide) {

        let state = recording().with { $0[status: .capture(side.other)] = .stopping }
        assert(state, .pieceFailed(.capture(side), error: anyError()), effect: nil)
    }

    @Test(arguments: sides)
    func failedCaptureStopsOnceTheOtherCaptureHasStopped_state(_ side: SessionSide) {

        let state = recording().with {
            $0[status: .capture(side.other)] = .stopping
            $0.fail(.capture(side), anyError())
        }
        assert(state, .captureStopped(side.other, error: nil), reducedTo: state.with {
            $0[status: .capture(side.other)] = .closed
            $0[status: .capture(side)] = .stopping
        })
    }

    @Test(arguments: sides)
    func failedCaptureStopsOnceTheOtherCaptureHasStopped_effect(_ side: SessionSide) {

        let state = recording().with {
            $0[status: .capture(side.other)] = .stopping
            $0.fail(.capture(side), anyError())
        }
        assert(state, .captureStopped(side.other, error: nil), effect: .stopCapture(side))
    }

    @Test(arguments: sides)
    func failedCaptureWaitsForHeldLiveText_state(_ side: SessionSide) {

        let state = holdingLiveText()
        let error = anyError()
        assert(state, .pieceFailed(.capture(side), error: error), reducedTo: state.with { $0.fail(.capture(side), error) })
    }

    @Test(arguments: sides)
    func failedCaptureWaitsForHeldLiveText_effect(_ side: SessionSide) {

        assert(holdingLiveText(), .pieceFailed(.capture(side), error: anyError()), effect: nil)
    }

    @Test(arguments: sides)
    func failedCaptureStopsOnceHeldLiveTextReplies_state(_ side: SessionSide) {

        let state = holdingLiveText().with { $0.fail(.capture(side), anyError()) }
        assert(state, .liveTextSet(request: state.pendingLiveText!, error: nil), reducedTo: state.with {
            $0.pendingLiveText = nil
            $0[status: .capture(side)] = .stopping
        })
    }

    @Test(arguments: sides)
    func failedCaptureStopsOnceHeldLiveTextReplies_effect(_ side: SessionSide) {

        let state = holdingLiveText().with { $0.fail(.capture(side), anyError()) }
        assert(state, .liveTextSet(request: state.pendingLiveText!, error: nil), effect: .stopCapture(side))
    }

    @Test(arguments: sides, results)
    func captureStopOutsideEndingClosesIt_state(_ side: SessionSide, _ error: String?) {

        let state = recording().with {
            $0[status: .capture(side)] = .stopping
            $0.fail(.capture(side), anyError())
        }
        assert(state, .captureStopped(side, error: error), reducedTo: state.with {
            $0[status: .capture(side)] = .closed
            if let error { $0.fail(.capture(side), error) }
        })
    }

    @Test(arguments: sides, results)
    func captureStopOutsideEndingClosesIt_effect(_ side: SessionSide, _ error: String?) {

        let state = recording().with {
            $0[status: .capture(side)] = .stopping
            $0.fail(.capture(side), anyError())
        }
        assert(state, .captureStopped(side, error: error), effect: nil)
    }

    @Test(arguments: sides)
    func failureOfAClosedCaptureStopsNothing_state(_ side: SessionSide) {

        let state = recording().with { $0[status: .capture(side)] = .closed }
        let error = anyError()
        assert(state, .pieceFailed(.capture(side), error: error), reducedTo: state.with { $0.fail(.capture(side), error) })
    }

    @Test(arguments: sides)
    func failureOfAClosedCaptureStopsNothing_effect(_ side: SessionSide) {

        let state = recording().with { $0[status: .capture(side)] = .closed }
        assert(state, .pieceFailed(.capture(side), error: anyError()), effect: nil)
    }

    @Test func failedLiveTextReplyKeepsACaptureStopInFlight_state() {

        let state = holdingLiveText().with { $0.microphoneCapture = .stopping }
        let error = anyError()
        assert(state, .liveTextSet(request: state.pendingLiveText!, error: error), reducedTo: state.with {
            $0.pendingLiveText = nil
            $0.fail(.callText, error)
        })
    }

    @Test func failedLiveTextReplyKeepsACaptureStopInFlight_effect() {

        let state = holdingLiveText().with { $0.microphoneCapture = .stopping }
        assert(state, .liveTextSet(request: state.pendingLiveText!, error: anyError()), effect: nil)
    }

    @Test(arguments: sides)
    func failedStopKeepsTheOtherStopInFlight_state(_ side: SessionSide) {

        let state = recording().with {
            $0.microphoneCapture = .stopping
            $0.callCapture = .stopping
        }
        let error = anyError()
        assert(state, .captureStopped(side, error: error), reducedTo: state.with {
            $0[status: .capture(side)] = .closed
            $0.fail(.capture(side), error)
        })
    }

    @Test(arguments: sides)
    func failedStopKeepsTheOtherStopInFlight_effect(_ side: SessionSide) {

        let state = recording().with {
            $0.microphoneCapture = .stopping
            $0.callCapture = .stopping
        }
        assert(state, .captureStopped(side, error: anyError()), effect: nil)
    }

    // MARK: Cannot record

    @Test(arguments: Unusable.allCases)
    func noUsableTrackAtTheEndOfBringUpCannotRecord_state(_ unusable: Unusable) {

        let state = bringingUp(starting: .capture(.call)).with { unusable.apply(to: &$0, on: .microphone) }
        let error = anyError()
        assert(state, .captureFinished(.call, error: error), reducedTo: state.with {
            $0.callCapture = .down
            $0.fail(.capture(.call), error)
            $0.cannotRecord = "no track can record"
        })
    }

    @Test(arguments: Unusable.allCases)
    func noUsableTrackAtTheEndOfBringUpCannotRecord_effect(_ unusable: Unusable) {

        let state = bringingUp(starting: .capture(.call)).with { unusable.apply(to: &$0, on: .microphone) }
        assert(state, .captureFinished(.call, error: anyError()), effect: nil)
    }

    @Test func bothSidesUnavailableAfterCallTextCannotRecord_state() {

        let state = bringingUp(starting: .callText).with {
            $0.health[.access(.microphone)] = .accessLost
            $0.health[.access(.call)] = .accessLost
        }
        assert(state, .callTextFinished(error: nil), reducedTo: state.with {
            $0.callText = .up
            $0.cannotRecord = "no track can record"
        })
    }

    @Test func bothSidesUnavailableAfterCallTextCannotRecord_effect() {

        let state = bringingUp(starting: .callText).with {
            $0.health[.access(.microphone)] = .accessLost
            $0.health[.access(.call)] = .accessLost
        }
        assert(state, .callTextFinished(error: nil), effect: nil)
    }

    @Test func failedCaptureWithNoUsableTrackAtTheEndOfBringUpStops_state() {

        let state = bringingUp(starting: .capture(.call)).with { $0.fail(.capture(.microphone), anyError()) }
        let error = anyError()
        assert(state, .captureFinished(.call, error: error), reducedTo: state.with {
            $0.callCapture = .down
            $0.fail(.capture(.call), error)
            $0.cannotRecord = "no track can record"
            $0.microphoneCapture = .stopping
        })
    }

    @Test func failedCaptureWithNoUsableTrackAtTheEndOfBringUpStops_effect() {

        let state = bringingUp(starting: .capture(.call)).with { $0.fail(.capture(.microphone), anyError()) }
        assert(state, .captureFinished(.call, error: anyError()), effect: .stopCapture(.microphone))
    }

    @Test(arguments: sides)
    func trackFailureKeepsRecordingOnTheOtherSide_state(_ side: SessionSide) {

        let state = recording()
        let error = anyError()
        assert(state, .pieceFailed(.track(side), error: error), reducedTo: state.with { $0.fail(.track(side), error) })
    }

    @Test(arguments: sides)
    func trackFailureKeepsRecordingOnTheOtherSide_effect(_ side: SessionSide) {

        assert(recording(), .pieceFailed(.track(side), error: anyError()), effect: nil)
    }

    @Test(arguments: sides, Unusable.allCases)
    func trackFailureLeavingNoUsableTrackCannotRecord_state(_ side: SessionSide, _ unusable: Unusable) {

        let state = recording().with { unusable.apply(to: &$0, on: side.other) }
        let error = anyError()
        assert(state, .pieceFailed(.track(side), error: error), reducedTo: state.with {
            $0.fail(.track(side), error)
            $0.cannotRecord = "no track can record"
            $0.phase = .bringingUp
        })
    }

    @Test(arguments: sides, Unusable.allCases)
    func trackFailureLeavingNoUsableTrackCannotRecord_effect(_ side: SessionSide, _ unusable: Unusable) {

        let state = recording().with { unusable.apply(to: &$0, on: side.other) }
        assert(state, .pieceFailed(.track(side), error: anyError()), effect: nil)
    }

    @Test(arguments: sides)
    func captureFailureLeavingNoUsableTrackCannotRecordAndStops_state(_ side: SessionSide) {

        let state = recording().with { $0.health[.access(side.other)] = .accessLost }
        let error = anyError()
        assert(state, .pieceFailed(.capture(side), error: error), reducedTo: state.with {
            $0.fail(.capture(side), error)
            $0.cannotRecord = "no track can record"
            $0.phase = .bringingUp
            $0[status: .capture(side)] = .stopping
        })
    }

    @Test(arguments: sides)
    func captureFailureLeavingNoUsableTrackCannotRecordAndStops_effect(_ side: SessionSide) {

        let state = recording().with { $0.health[.access(side.other)] = .accessLost }
        assert(state, .pieceFailed(.capture(side), error: anyError()), effect: .stopCapture(side))
    }

    @Test func folderFailureWhileRecordingCannotRecord_state() {

        let state = recording()
        let error = anyError()
        assert(state, .pieceFailed(.folder, error: error), reducedTo: state.with {
            $0.fail(.folder, error)
            $0.cannotRecord = "folder: \(error)"
        })
    }

    @Test func folderFailureWhileRecordingCannotRecord_effect() {

        assert(recording(), .pieceFailed(.folder, error: anyError()), effect: nil)
    }

    @Test(arguments: [SessionState.Piece.processes, .transcript, .callText])
    func otherFailureWhileRecordingIsNamed_state(_ piece: SessionState.Piece) {

        let state = recording()
        let error = anyError()
        assert(state, .pieceFailed(piece, error: error), reducedTo: state.with { $0.fail(piece, error) })
    }

    @Test(arguments: [SessionState.Piece.processes, .transcript, .callText])
    func otherFailureWhileRecordingIsNamed_effect(_ piece: SessionState.Piece) {

        assert(recording(), .pieceFailed(piece, error: anyError()), effect: nil)
    }
}
