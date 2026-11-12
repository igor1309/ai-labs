import Foundation
import Session
import Testing

extension SessionReducerTests {

    // MARK: Failures keep pending work

    @Test(arguments: bringUpOrder.filter { $0 != .folder })
    func failureWhileAPieceStartsKeepsItStarting_state(_ piece: SessionState.Piece) {

        let state = makeBringingUp(starting: piece)
        let error = anyError()
        assert(state, .pieceFailed(piece, error: error)) { $0.fail(piece, error) }
    }

    @Test(arguments: bringUpOrder.filter { $0 != .folder })
    func failureWhileAPieceStartsKeepsItStarting_effect(_ piece: SessionState.Piece) {

        assert(makeBringingUp(starting: piece), .pieceFailed(piece, error: anyError()), delivers: nil)
    }

    @Test func failureWhileTheFolderIsCreatedKeepsItStarting_state() {

        let state = makeBringingUp(starting: .folder)
        let error = anyError()
        assert(state, .pieceFailed(.folder, error: error)) {
            $0.fail(.folder, error)
            $0.cannotRecord = "folder: \(error)"
        }
    }

    @Test func failureWhileTheFolderIsCreatedKeepsItStarting_effect() {

        assert(makeBringingUp(starting: .folder), .pieceFailed(.folder, error: anyError()), delivers: nil)
    }

    @Test func createdFolderAfterItsFailureStopsBringUp_state() {

        let state = makeBringingUp(starting: .folder).with { $0.fail(.folder, anyError()) }
        let folder = anyFolder()
        assert(state, .folderFinished(error: nil, folder: folder)) {
            $0.folder = .up
            $0.recordedFolder = folder
        }
    }

    @Test func createdFolderAfterItsFailureStopsBringUp_effect() {

        let state = makeBringingUp(starting: .folder).with { $0.fail(.folder, anyError()) }
        assert(state, .folderFinished(error: nil, folder: anyFolder()), delivers: nil)
    }

    @Test(arguments: openingSteps)
    func heldResultAfterAFailureStillStartsTheNextPiece_state(_ step: OpeningStep) {

        let state = makeBringingUp(starting: step.piece).with { $0.fail(step.piece, anyError()) }
        assert(state, startResult(step.piece, error: nil)) {
            $0[status: step.piece] = .up
            $0[status: step.next] = .starting
        }
    }

    @Test(arguments: openingSteps)
    func heldResultAfterAFailureStillStartsTheNextPiece_effect(_ step: OpeningStep) {

        let state = makeBringingUp(starting: step.piece).with { $0.fail(step.piece, anyError()) }
        assert(state, startResult(step.piece, error: nil), delivers: step.effect)
    }

    @Test func heldMicrophoneCaptureAfterAFailureStillStartsTheCallCapture_state() {

        let state = makeBringingUp(starting: .capture(.microphone)).with { $0.fail(.capture(.microphone), anyError()) }
        assert(state, .captureFinished(.microphone, error: nil)) {
            $0.microphoneCapture = .up
            $0.callCapture = .starting
        }
    }

    @Test func heldMicrophoneCaptureAfterAFailureStillStartsTheCallCapture_effect() {

        let state = makeBringingUp(starting: .capture(.microphone)).with { $0.fail(.capture(.microphone), anyError()) }
        assert(state, .captureFinished(.microphone, error: nil), delivers: .startCallCapture(selection: .chosen(state.processSelection!)))
    }

    @Test func heldCallCaptureAfterAFailureRecordsThenStopsIt_state() {

        let state = makeBringingUp(starting: .capture(.call)).with { $0.fail(.capture(.call), anyError()) }
        assert(state, .captureFinished(.call, error: nil)) {
            $0.callCapture = .stopping
            $0.phase = .recording
        }
    }

    @Test func heldCallCaptureAfterAFailureRecordsThenStopsIt_effect() {

        let state = makeBringingUp(starting: .capture(.call)).with { $0.fail(.capture(.call), anyError()) }
        assert(state, .captureFinished(.call, error: nil), delivers: .stopCapture(.call))
    }

    @Test func failedMicrophoneCaptureStopsOnceTheCallCaptureIsUp_state() {

        let state = makeBringingUp(starting: .capture(.call)).with { $0.fail(.capture(.microphone), anyError()) }
        assert(state, .captureFinished(.call, error: nil)) {
            $0.callCapture = .up
            $0.microphoneCapture = .stopping
            $0.phase = .recording
        }
    }

    @Test func failedMicrophoneCaptureStopsOnceTheCallCaptureIsUp_effect() {

        let state = makeBringingUp(starting: .capture(.call)).with { $0.fail(.capture(.microphone), anyError()) }
        assert(state, .captureFinished(.call, error: nil), delivers: .stopCapture(.microphone))
    }

    @Test(arguments: stopOrder)
    func failureWhileAPieceStopsKeepsItStopping_state(_ piece: SessionState.Piece) {

        let state = makeStopping(piece)
        let error = anyError()
        assert(state, .pieceFailed(piece, error: error)) { $0.fail(piece, error) }
    }

    @Test(arguments: stopOrder)
    func failureWhileAPieceStopsKeepsItStopping_effect(_ piece: SessionState.Piece) {

        assert(makeStopping(piece), .pieceFailed(piece, error: anyError()), delivers: nil)
    }

    @Test(arguments: bringUpOrder)
    func failureWhileEndingKeepsAPieceStarting_state(_ piece: SessionState.Piece) {

        let state = makeEndingWhileStarting(piece)
        let error = anyError()
        assert(state, .pieceFailed(piece, error: error)) {
            $0.fail(piece, error)
            if piece == .folder { $0.cannotRecord = "folder: \(error)" }
        }
    }

    @Test(arguments: bringUpOrder)
    func failureWhileEndingKeepsAPieceStarting_effect(_ piece: SessionState.Piece) {

        assert(makeEndingWhileStarting(piece), .pieceFailed(piece, error: anyError()), delivers: nil)
    }

    @Test(arguments: sides)
    func accessLossWhileEndingKeepsACaptureStarting_state(_ side: SessionSide) {

        let state = makeEndingWhileStarting(.capture(side))
        assert(state, .accessChanged(side, available: false)) { $0.loseAccess(side) }
    }

    @Test(arguments: sides)
    func accessLossWhileEndingKeepsACaptureStarting_effect(_ side: SessionSide) {

        assert(makeEndingWhileStarting(.capture(side)), .accessChanged(side, available: false), delivers: nil)
    }



    @Test(arguments: bringUpOrder)
    func endWhileAFailedPieceStartsWaitsForIt_state(_ piece: SessionState.Piece) {

        let state = makeBringingUp(starting: piece).with { $0.fail(piece, anyError()) }
        assert(state, .end) { $0.phase = .ending }
    }

    @Test(arguments: bringUpOrder)
    func endWhileAFailedPieceStartsWaitsForIt_effect(_ piece: SessionState.Piece) {

        let state = makeBringingUp(starting: piece).with { $0.fail(piece, anyError()) }
        assert(state, .end, delivers: nil)
    }

    @Test(arguments: sides)
    func endWhileACaptureWithoutAccessStartsWaitsForIt_state(_ side: SessionSide) {

        let state = makeBringingUp(starting: .capture(side)).with { $0.loseAccess(side) }
        assert(state, .end) { $0.phase = .ending }
    }

    @Test(arguments: sides)
    func endWhileACaptureWithoutAccessStartsWaitsForIt_effect(_ side: SessionSide) {

        let state = makeBringingUp(starting: .capture(side)).with { $0.loseAccess(side) }
        assert(state, .end, delivers: nil)
    }

    @Test(arguments: heldStarts)
    func failedPieceStartedWhileEndingStopsTheFirstPieceUp_state(_ start: HeldStart) {

        let state = makeEndingWhileStarting(start.piece).with { $0.fail(start.piece, anyError()) }
        assert(state, startResult(start.piece, error: nil)) {
            $0[status: start.piece] = .up
            $0[status: start.firstStop] = .stopping
        }
    }

    @Test(arguments: heldStarts)
    func failedPieceStartedWhileEndingStopsTheFirstPieceUp_effect(_ start: HeldStart) {

        let state = makeEndingWhileStarting(start.piece).with { $0.fail(start.piece, anyError()) }
        assert(state, startResult(start.piece, error: nil), delivers: stopEffect(start.firstStop))
    }

    @Test(arguments: sides)
    func captureWithoutAccessStartedWhileEndingIsStopped_state(_ side: SessionSide) {

        let state = makeEndingWhileStarting(.capture(side)).with { $0.loseAccess(side) }
        assert(state, .captureFinished(side, error: nil)) {
            $0[status: .capture(side)] = .up
            $0.microphoneCapture = .stopping
        }
    }

    @Test(arguments: sides)
    func captureWithoutAccessStartedWhileEndingIsStopped_effect(_ side: SessionSide) {

        let state = makeEndingWhileStarting(.capture(side)).with { $0.loseAccess(side) }
        assert(state, .captureFinished(side, error: nil), delivers: .stopCapture(.microphone))
    }

    @Test func folderCreatedAfterItsFailureWhileEndingEnds_state() {

        let state = makeEndingWhileStarting(.folder).with { $0.fail(.folder, anyError()) }
        let folder = anyFolder()
        assert(state, .folderFinished(error: nil, folder: folder)) {
            $0.folder = .closed
            $0.recordedFolder = folder
            $0.phase = .ended
        }
    }

    @Test func folderCreatedAfterItsFailureWhileEndingEnds_effect() {

        let state = makeEndingWhileStarting(.folder).with { $0.fail(.folder, anyError()) }
        assert(state, .folderFinished(error: nil, folder: anyFolder()), delivers: nil)
    }

    @Test func processesSelectedAfterTheirFailureWhileEndingEnd_state() {

        let state = makeEndingWhileStarting(.processes).with { $0.fail(.processes, anyError()) }
        let selection = anySelection()
        assert(state, .processesFinished(selection: selection, error: nil)) {
            $0.folder = .closed
            $0.processes = .closed
            $0.processSelection = selection
            $0.phase = .ended
        }
    }

    @Test func processesSelectedAfterTheirFailureWhileEndingEnd_effect() {

        let state = makeEndingWhileStarting(.processes).with { $0.fail(.processes, anyError()) }
        assert(state, .processesFinished(selection: anySelection(), error: nil), delivers: nil)
    }

    @Test(arguments: stopOrder)
    func heldStopAfterAFailureStillGoesOn_state(_ piece: SessionState.Piece) {

        let state = makeStopping(piece).with { $0.fail(piece, anyError()) }
        assert(state, stopResult(piece, error: nil)) {
            $0[status: piece] = .closed
            $0.goOn(after: piece)
        }
    }

    @Test(arguments: stopOrder)
    func heldStopAfterAFailureStillGoesOn_effect(_ piece: SessionState.Piece) {

        let state = makeStopping(piece).with { $0.fail(piece, anyError()) }
        assert(state, stopResult(piece, error: nil), delivers: nextStopEffect(after: piece))
    }

    @Test(arguments: sides)
    func failedCaptureStopsBetweenOperations_state(_ side: SessionSide) {

        let state = makeRecording()
        let error = anyError()
        assert(state, .pieceFailed(.capture(side), error: error)) {
            $0.fail(.capture(side), error)
            $0[status: .capture(side)] = .stopping
        }
    }

    @Test(arguments: sides)
    func failedCaptureStopsBetweenOperations_effect(_ side: SessionSide) {

        assert(makeRecording(), .pieceFailed(.capture(side), error: anyError()), delivers: .stopCapture(side))
    }

    @Test(arguments: sides)
    func failedCaptureWaitsForTheOtherCaptureToStop_state(_ side: SessionSide) {

        let state = makeRecording().with { $0[status: .capture(side.other)] = .stopping }
        let error = anyError()
        assert(state, .pieceFailed(.capture(side), error: error)) {
            $0.fail(.capture(side), error)
            $0.cannotRecord = "no track can record"
            $0.phase = .bringingUp
        }
    }

    @Test(arguments: sides)
    func failedCaptureWaitsForTheOtherCaptureToStop_effect(_ side: SessionSide) {

        let state = makeRecording().with { $0[status: .capture(side.other)] = .stopping }
        assert(state, .pieceFailed(.capture(side), error: anyError()), delivers: nil)
    }

    @Test(arguments: sides)
    func failedCaptureStopsOnceTheOtherCaptureHasStopped_state(_ side: SessionSide) {

        let state = makeRecording().with {
            $0[status: .capture(side.other)] = .stopping
            $0.fail(.capture(side), anyError())
        }
        assert(state, .captureStopped(side.other, error: nil)) {
            $0[status: .capture(side.other)] = .closed
            $0[status: .capture(side)] = .stopping
        }
    }

    @Test(arguments: sides)
    func failedCaptureStopsOnceTheOtherCaptureHasStopped_effect(_ side: SessionSide) {

        let state = makeRecording().with {
            $0[status: .capture(side.other)] = .stopping
            $0.fail(.capture(side), anyError())
        }
        assert(state, .captureStopped(side.other, error: nil), delivers: .stopCapture(side))
    }

    @Test(arguments: sides)
    func failedCaptureWaitsForHeldLiveText_state(_ side: SessionSide) {

        let state = makeHoldingLiveText()
        let error = anyError()
        assert(state, .pieceFailed(.capture(side), error: error)) { $0.fail(.capture(side), error) }
    }

    @Test(arguments: sides)
    func failedCaptureWaitsForHeldLiveText_effect(_ side: SessionSide) {

        assert(makeHoldingLiveText(), .pieceFailed(.capture(side), error: anyError()), delivers: nil)
    }

    @Test(arguments: sides)
    func failedCaptureStopsOnceHeldLiveTextReplies_state(_ side: SessionSide) {

        let state = makeHoldingLiveText().with { $0.fail(.capture(side), anyError()) }
        assert(state, .liveTextSet(request: state.pendingLiveText!, error: nil)) {
            $0.pendingLiveText = nil
            $0[status: .capture(side)] = .stopping
        }
    }

    @Test(arguments: sides)
    func failedCaptureStopsOnceHeldLiveTextReplies_effect(_ side: SessionSide) {

        let state = makeHoldingLiveText().with { $0.fail(.capture(side), anyError()) }
        assert(state, .liveTextSet(request: state.pendingLiveText!, error: nil), delivers: .stopCapture(side))
    }

    @Test(arguments: sides, results)
    func captureStopOutsideEndingClosesIt_state(_ side: SessionSide, _ error: String?) {

        let state = makeRecording().with {
            $0[status: .capture(side)] = .stopping
            $0.fail(.capture(side), anyError())
        }
        assert(state, .captureStopped(side, error: error)) {
            $0[status: .capture(side)] = .closed
            if let error { $0.fail(.capture(side), error) }
        }
    }

    @Test(arguments: sides, results)
    func captureStopOutsideEndingClosesIt_effect(_ side: SessionSide, _ error: String?) {

        let state = makeRecording().with {
            $0[status: .capture(side)] = .stopping
            $0.fail(.capture(side), anyError())
        }
        assert(state, .captureStopped(side, error: error), delivers: nil)
    }

    @Test(arguments: sides)
    func failureOfAClosedCaptureStopsNothing_state(_ side: SessionSide) {

        let state = makeRecording().with { $0[status: .capture(side)] = .closed }
        let error = anyError()
        assert(state, .pieceFailed(.capture(side), error: error)) { $0.fail(.capture(side), error) }
    }

    @Test(arguments: sides)
    func failureOfAClosedCaptureStopsNothing_effect(_ side: SessionSide) {

        let state = makeRecording().with { $0[status: .capture(side)] = .closed }
        assert(state, .pieceFailed(.capture(side), error: anyError()), delivers: nil)
    }

    @Test func failedLiveTextReplyKeepsACaptureStopInFlight_state() {

        let state = makeHoldingLiveText().with { $0.microphoneCapture = .stopping }
        let error = anyError()
        assert(state, .liveTextSet(request: state.pendingLiveText!, error: error)) {
            $0.pendingLiveText = nil
            $0.fail(.callText, error)
        }
    }

    @Test func failedLiveTextReplyKeepsACaptureStopInFlight_effect() {

        let state = makeHoldingLiveText().with { $0.microphoneCapture = .stopping }
        assert(state, .liveTextSet(request: state.pendingLiveText!, error: anyError()), delivers: nil)
    }

    @Test(arguments: sides)
    func failedStopKeepsTheOtherStopInFlight_state(_ side: SessionSide) {

        let state = makeRecording().with {
            $0.microphoneCapture = .stopping
            $0.callCapture = .stopping
        }
        let error = anyError()
        assert(state, .captureStopped(side, error: error)) {
            $0[status: .capture(side)] = .closed
            $0.fail(.capture(side), error)
        }
    }

    @Test(arguments: sides)
    func failedStopKeepsTheOtherStopInFlight_effect(_ side: SessionSide) {

        let state = makeRecording().with {
            $0.microphoneCapture = .stopping
            $0.callCapture = .stopping
        }
        assert(state, .captureStopped(side, error: anyError()), delivers: nil)
    }

    @Test(arguments: sides)
    func failedCaptureStoppedWhileRecordingIsClosed_state(_ side: SessionSide) {

        let state = makeRecording().with {
            $0.fail(.capture(side), anyError())
            $0[status: .capture(side)] = .stopping
        }
        assert(state, .captureStopped(side, error: nil)) { $0[status: .capture(side)] = .closed }
    }

    @Test(arguments: sides)
    func failedCaptureStoppedWhileRecordingIsClosed_effect(_ side: SessionSide) {

        let state = makeRecording().with {
            $0.fail(.capture(side), anyError())
            $0[status: .capture(side)] = .stopping
        }
        assert(state, .captureStopped(side, error: nil), delivers: nil)
    }

    @Test(arguments: sides)
    func endAfterAFailedCaptureClosedStopsTheOtherCapture_state(_ side: SessionSide) {

        let state = makeRecording().with {
            $0.fail(.capture(side), anyError())
            $0[status: .capture(side)] = .closed
        }
        assert(state, .end) {
            $0.phase = .ending
            $0[status: .capture(side.other)] = .stopping
        }
    }

    @Test(arguments: sides)
    func endAfterAFailedCaptureClosedStopsTheOtherCapture_effect(_ side: SessionSide) {

        let state = makeRecording().with {
            $0.fail(.capture(side), anyError())
            $0[status: .capture(side)] = .closed
        }
        assert(state, .end, delivers: .stopCapture(side.other))
    }

    @Test func microphoneCaptureUpAfterItsAccessIsLostKeepsTheLossAndStartsTheCallCapture_state() {

        let state = makeBringingUp(starting: .capture(.microphone)).with { $0.loseAccess(.microphone) }
        assert(state, .captureFinished(.microphone, error: nil)) {
            $0.microphoneCapture = .up
            $0.callCapture = .starting
        }
    }

    @Test func microphoneCaptureUpAfterItsAccessIsLostKeepsTheLossAndStartsTheCallCapture_effect() {

        let state = makeBringingUp(starting: .capture(.microphone)).with { $0.loseAccess(.microphone) }
        assert(state, .captureFinished(.microphone, error: nil), delivers: .startCallCapture(selection: .chosen(state.processSelection!)))
    }

    @Test(arguments: sides)
    func accessLossAfterTheOtherTrackFailedCannotRecord_state(_ side: SessionSide) {

        let state = makeRecording().with { $0.fail(.track(side.other), anyError()) }
        assert(state, .accessChanged(side, available: false)) {
            $0.loseAccess(side)
            $0.cannotRecord = "no track can record"
            $0.phase = .bringingUp
        }
    }

    @Test(arguments: sides)
    func accessLossAfterTheOtherTrackFailedCannotRecord_effect(_ side: SessionSide) {

        let state = makeRecording().with { $0.fail(.track(side.other), anyError()) }
        assert(state, .accessChanged(side, available: false), delivers: nil)
    }

    @Test(arguments: sides)
    func captureFailureAfterTheOtherCaptureFailedCannotRecordAndStops_state(_ side: SessionSide) {

        let state = makeRecording().with {
            $0.fail(.capture(side.other), anyError())
            $0[status: .capture(side.other)] = .closed
        }
        let error = anyError()
        assert(state, .pieceFailed(.capture(side), error: error)) {
            $0.fail(.capture(side), error)
            $0.cannotRecord = "no track can record"
            $0.phase = .bringingUp
            $0[status: .capture(side)] = .stopping
        }
    }

    @Test(arguments: sides)
    func captureFailureAfterTheOtherCaptureFailedCannotRecordAndStops_effect(_ side: SessionSide) {

        let state = makeRecording().with {
            $0.fail(.capture(side.other), anyError())
            $0[status: .capture(side.other)] = .closed
        }
        assert(state, .pieceFailed(.capture(side), error: anyError()), delivers: .stopCapture(side))
    }

    @Test func failedMicrophoneCaptureUpWithTheCallCaptureUpRecordsThenStopsIt_state() {

        let state = makeBringingUp(starting: .capture(.microphone)).with {
            $0.callCapture = .up
            $0.fail(.capture(.microphone), anyError())
        }
        assert(state, .captureFinished(.microphone, error: nil)) {
            $0.microphoneCapture = .stopping
            $0.phase = .recording
        }
    }

    @Test func failedMicrophoneCaptureUpWithTheCallCaptureUpRecordsThenStopsIt_effect() {

        let state = makeBringingUp(starting: .capture(.microphone)).with {
            $0.callCapture = .up
            $0.fail(.capture(.microphone), anyError())
        }
        assert(state, .captureFinished(.microphone, error: nil), delivers: .stopCapture(.microphone))
    }

    // MARK: Cannot record

    @Test(arguments: Unusable.allCases)
    func noUsableTrackAtTheEndOfBringUpCannotRecord_state(_ unusable: Unusable) {

        let state = makeBringingUp(starting: .capture(.call)).with { unusable.apply(to: &$0, on: .microphone) }
        let error = anyError()
        assert(state, .captureFinished(.call, error: error)) {
            $0.callCapture = .down
            $0.fail(.capture(.call), error)
            $0.cannotRecord = "no track can record"
        }
    }

    @Test(arguments: Unusable.allCases)
    func noUsableTrackAtTheEndOfBringUpCannotRecord_effect(_ unusable: Unusable) {

        let state = makeBringingUp(starting: .capture(.call)).with { unusable.apply(to: &$0, on: .microphone) }
        assert(state, .captureFinished(.call, error: anyError()), delivers: nil)
    }

    @Test func bothSidesUnavailableAfterCallTextCannotRecord_state() {

        let state = makeBringingUp(starting: .callText).with {
            $0.health[.access(.microphone)] = .accessLost
            $0.health[.access(.call)] = .accessLost
        }
        assert(state, .callTextFinished(error: nil)) {
            $0.callText = .up
            $0.cannotRecord = "no track can record"
        }
    }

    @Test func bothSidesUnavailableAfterCallTextCannotRecord_effect() {

        let state = makeBringingUp(starting: .callText).with {
            $0.health[.access(.microphone)] = .accessLost
            $0.health[.access(.call)] = .accessLost
        }
        assert(state, .callTextFinished(error: nil), delivers: nil)
    }

    @Test func failedCaptureWithNoUsableTrackAtTheEndOfBringUpStops_state() {

        let state = makeBringingUp(starting: .capture(.call)).with { $0.fail(.capture(.microphone), anyError()) }
        let error = anyError()
        assert(state, .captureFinished(.call, error: error)) {
            $0.callCapture = .down
            $0.fail(.capture(.call), error)
            $0.cannotRecord = "no track can record"
            $0.microphoneCapture = .stopping
        }
    }

    @Test func failedCaptureWithNoUsableTrackAtTheEndOfBringUpStops_effect() {

        let state = makeBringingUp(starting: .capture(.call)).with { $0.fail(.capture(.microphone), anyError()) }
        assert(state, .captureFinished(.call, error: anyError()), delivers: .stopCapture(.microphone))
    }

    @Test(arguments: sides)
    func trackFailureKeepsRecordingOnTheOtherSide_state(_ side: SessionSide) {

        let state = makeRecording()
        let error = anyError()
        assert(state, .pieceFailed(.track(side), error: error)) { $0.fail(.track(side), error) }
    }

    @Test(arguments: sides)
    func trackFailureKeepsRecordingOnTheOtherSide_effect(_ side: SessionSide) {

        assert(makeRecording(), .pieceFailed(.track(side), error: anyError()), delivers: nil)
    }

    @Test(arguments: sides, Unusable.allCases)
    func trackFailureLeavingNoUsableTrackCannotRecord_state(_ side: SessionSide, _ unusable: Unusable) {

        let state = makeRecording().with { unusable.apply(to: &$0, on: side.other) }
        let error = anyError()
        assert(state, .pieceFailed(.track(side), error: error)) {
            $0.fail(.track(side), error)
            $0.cannotRecord = "no track can record"
            $0.phase = .bringingUp
        }
    }

    @Test(arguments: sides, Unusable.allCases)
    func trackFailureLeavingNoUsableTrackCannotRecord_effect(_ side: SessionSide, _ unusable: Unusable) {

        let state = makeRecording().with { unusable.apply(to: &$0, on: side.other) }
        assert(state, .pieceFailed(.track(side), error: anyError()), delivers: nil)
    }

    @Test(arguments: sides)
    func captureFailureLeavingNoUsableTrackCannotRecordAndStops_state(_ side: SessionSide) {

        let state = makeRecording().with { $0.health[.access(side.other)] = .accessLost }
        let error = anyError()
        assert(state, .pieceFailed(.capture(side), error: error)) {
            $0.fail(.capture(side), error)
            $0.cannotRecord = "no track can record"
            $0.phase = .bringingUp
            $0[status: .capture(side)] = .stopping
        }
    }

    @Test(arguments: sides)
    func captureFailureLeavingNoUsableTrackCannotRecordAndStops_effect(_ side: SessionSide) {

        let state = makeRecording().with { $0.health[.access(side.other)] = .accessLost }
        assert(state, .pieceFailed(.capture(side), error: anyError()), delivers: .stopCapture(side))
    }

    @Test func folderFailureWhileRecordingCannotRecord_state() {

        let state = makeRecording()
        let error = anyError()
        assert(state, .pieceFailed(.folder, error: error)) {
            $0.fail(.folder, error)
            $0.cannotRecord = "folder: \(error)"
        }
    }

    @Test func folderFailureWhileRecordingCannotRecord_effect() {

        assert(makeRecording(), .pieceFailed(.folder, error: anyError()), delivers: nil)
    }

    @Test(arguments: [SessionState.Piece.processes, .transcript, .callText])
    func otherFailureWhileRecordingIsNamed_state(_ piece: SessionState.Piece) {

        let state = makeRecording()
        let error = anyError()
        assert(state, .pieceFailed(piece, error: error)) { $0.fail(piece, error) }
    }

    @Test(arguments: [SessionState.Piece.processes, .transcript, .callText])
    func otherFailureWhileRecordingIsNamed_effect(_ piece: SessionState.Piece) {

        assert(makeRecording(), .pieceFailed(piece, error: anyError()), delivers: nil)
    }
}
