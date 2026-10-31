import Foundation
import Session
import Testing

struct SessionReducerTests {

    // MARK: Bring-up order

    @Test(arguments: [true, false])
    func beginChecksModels_state(_ wanted: Bool) {

        let state = idle().with { $0.audioWarning = .callSilent }
        assert(state, .begin(liveText: wanted), reducedTo: state.with {
            $0.phase = .bringingUp
            $0.wantedLiveText = wanted
            $0.audioWarning = nil
        })
    }

    @Test(arguments: [true, false])
    func beginChecksModels_effect(_ wanted: Bool) {

        assert(idle(), .begin(liveText: wanted), effect: .checkModels)
    }

    @Test func modelsOnDiskCreateTheFolder_state() {

        let state = checkingModels()
        assert(state, .modelsChecked(missing: []), reducedTo: state.with { $0.folder = .starting })
    }

    @Test func modelsOnDiskCreateTheFolder_effect() {

        assert(checkingModels(), .modelsChecked(missing: []), effect: .createFolder)
    }

    @Test(arguments: missingModels)
    func missingModelsCannotRecord_state(_ names: [String], _ listed: String) {

        let state = checkingModels()
        assert(state, .modelsChecked(missing: names), reducedTo: state.with {
            $0.failures.append(.init(piece: "model", message: "\(listed) not on disk"))
            $0.cannotRecord = "model: \(listed) not on disk"
        })
    }

    @Test(arguments: missingModels)
    func missingModelsCannotRecord_effect(_ names: [String], _: String) {

        assert(checkingModels(), .modelsChecked(missing: names), effect: nil)
    }

    @Test func createdFolderIsKeptAndSelectsProcesses_state() {

        let state = bringingUp(starting: .folder)
        let folder = anyFolder()
        assert(state, .folderFinished(error: nil, folder: folder), reducedTo: state.with {
            $0.folder = .up
            $0.recordedFolder = folder
            $0.processes = .starting
        })
    }

    @Test func createdFolderIsKeptAndSelectsProcesses_effect() {

        assert(bringingUp(starting: .folder), .folderFinished(error: nil, folder: anyFolder()), effect: .selectProcesses)
    }

    @Test func folderFailureCannotRecord_state() {

        let state = bringingUp(starting: .folder)
        let error = anyError()
        assert(state, .folderFinished(error: error), reducedTo: state.with {
            $0.folder = .down
            $0.fail(.folder, error)
            $0.cannotRecord = "folder: \(error)"
        })
    }

    @Test func folderFailureCannotRecord_effect() {

        assert(bringingUp(starting: .folder), .folderFinished(error: anyError()), effect: nil)
    }

    @Test func selectedProcessesAreKeptAndOpenTheMicrophoneTrack_state() {

        let state = bringingUp(starting: .processes)
        let selection = anySelection()
        assert(state, .processesFinished(selection: selection, error: nil), reducedTo: state.with {
            $0.processes = .up
            $0.processSelection = selection
            $0.microphoneTrack = .starting
        })
    }

    @Test func selectedProcessesAreKeptAndOpenTheMicrophoneTrack_effect() {

        assert(bringingUp(starting: .processes), .processesFinished(selection: anySelection(), error: nil), effect: .openTrack(.microphone))
    }

    @Test func failedProcessSelectionIsNamedAndOpensTheMicrophoneTrack_state() {

        let state = bringingUp(starting: .processes)
        let error = anyError()
        assert(state, .processesFinished(selection: nil, error: error), reducedTo: state.with {
            $0.processes = .down
            $0.fail(.processes, error)
            $0.processSelection = nil
            $0.microphoneTrack = .starting
        })
    }

    @Test func failedProcessSelectionIsNamedAndOpensTheMicrophoneTrack_effect() {

        assert(bringingUp(starting: .processes), .processesFinished(selection: nil, error: anyError()), effect: .openTrack(.microphone))
    }

    @Test(arguments: openingSteps, results)
    func pieceResultStartsTheNextPiece_state(_ step: OpeningStep, _ error: String?) {

        let state = bringingUp(starting: step.piece)
        assert(state, startResult(step.piece, error: error), reducedTo: state.with {
            $0[status: step.piece] = error == nil ? .up : .down
            if let error { $0.fail(step.piece, error) }
            $0[status: step.next] = .starting
        })
    }

    @Test(arguments: openingSteps, results)
    func pieceResultStartsTheNextPiece_effect(_ step: OpeningStep, _ error: String?) {

        assert(bringingUp(starting: step.piece), startResult(step.piece, error: error), effect: step.effect)
    }

    @Test(arguments: results, [true, false])
    func transcriptResultStartsCallTextAsWanted_state(_ error: String?, _ wanted: Bool) {

        let state = bringingUp(starting: .transcript).with { $0.wantedLiveText = wanted }
        assert(state, .transcriptFinished(error: error), reducedTo: state.with {
            $0.transcript = error == nil ? .up : .down
            if let error { $0.fail(.transcript, error) }
            $0.callText = .starting
        })
    }

    @Test(arguments: results, [true, false])
    func transcriptResultStartsCallTextAsWanted_effect(_ error: String?, _ wanted: Bool) {

        let state = bringingUp(starting: .transcript).with { $0.wantedLiveText = wanted }
        assert(state, .transcriptFinished(error: error), effect: .startCallText(enabled: wanted))
    }

    @Test(arguments: unavailable(.microphone))
    func unavailableMicrophoneSkipsItsCapture_state(_ health: [SessionState.Piece: SessionState.Health]) {

        let state = bringingUp(starting: .callText).with { $0.health = health }
        assert(state, .callTextFinished(error: nil), reducedTo: state.with {
            $0.callText = .up
            $0.callCapture = .starting
        })
    }

    @Test(arguments: unavailable(.microphone))
    func unavailableMicrophoneSkipsItsCapture_effect(_ health: [SessionState.Piece: SessionState.Health]) {

        let selection = anySelection()
        let state = bringingUp(starting: .callText).with {
            $0.health = health
            $0.processSelection = selection
        }
        assert(state, .callTextFinished(error: nil), effect: .startCallCapture(selection: .chosen(selection)))
    }

    @Test(arguments: results)
    func microphoneCaptureResultStartsTheCallCapture_state(_ error: String?) {

        let state = bringingUp(starting: .capture(.microphone))
        assert(state, .captureFinished(.microphone, error: error), reducedTo: state.with {
            $0.microphoneCapture = error == nil ? .up : .down
            if let error { $0.fail(.capture(.microphone), error) }
            $0.callCapture = .starting
        })
    }

    @Test(arguments: results)
    func microphoneCaptureResultStartsTheCallCapture_effect(_ error: String?) {

        let selection = anySelection()
        let state = bringingUp(starting: .capture(.microphone)).with { $0.processSelection = selection }
        assert(state, .captureFinished(.microphone, error: error), effect: .startCallCapture(selection: .chosen(selection)))
    }

    @Test func callCaptureWithoutChosenAppsHearsEveryAppButAudelin_state() {

        let state = bringingUp(starting: .capture(.microphone)).with { $0.processSelection = nil }
        assert(state, .captureFinished(.microphone, error: nil), reducedTo: state.with {
            $0.microphoneCapture = .up
            $0.callCapture = .starting
        })
    }

    @Test func callCaptureWithoutChosenAppsHearsEveryAppButAudelin_effect() {

        let state = bringingUp(starting: .capture(.microphone)).with { $0.processSelection = nil }
        assert(state, .captureFinished(.microphone, error: nil), effect: .startCallCapture(selection: .everyAppButAudelin))
    }

    @Test(arguments: unavailable(.call))
    func unavailableCallSideSkipsItsCapture_state(_ health: [SessionState.Piece: SessionState.Health]) {

        let state = bringingUp(starting: .capture(.microphone)).with { $0.health = health }
        assert(state, .captureFinished(.microphone, error: nil), reducedTo: state.with {
            $0.microphoneCapture = .up
            $0.phase = .recording
        })
    }

    @Test(arguments: unavailable(.call))
    func unavailableCallSideSkipsItsCapture_effect(_ health: [SessionState.Piece: SessionState.Health]) {

        let state = bringingUp(starting: .capture(.microphone)).with { $0.health = health }
        assert(state, .captureFinished(.microphone, error: nil), effect: nil)
    }

    @Test func callCaptureCompletesBringUp_state() {

        let state = bringingUp(starting: .capture(.call))
        assert(state, .captureFinished(.call, error: nil), reducedTo: state.with {
            $0.callCapture = .up
            $0.phase = .recording
        })
    }

    @Test func callCaptureCompletesBringUp_effect() {

        assert(bringingUp(starting: .capture(.call)), .captureFinished(.call, error: nil), effect: nil)
    }

    @Test func failedCallCaptureRecordsOnTheMicrophone_state() {

        let state = bringingUp(starting: .capture(.call))
        let error = anyError()
        assert(state, .captureFinished(.call, error: error), reducedTo: state.with {
            $0.callCapture = .down
            $0.fail(.capture(.call), error)
            $0.phase = .recording
        })
    }

    @Test func failedCallCaptureRecordsOnTheMicrophone_effect() {

        assert(bringingUp(starting: .capture(.call)), .captureFinished(.call, error: anyError()), effect: nil)
    }

    // MARK: Bring-down order

    @Test(arguments: stopOrder)
    func endStopsTheFirstPieceStillUp_state(_ piece: SessionState.Piece) {

        let state = recording(withDown: piecesStopped(before: piece))
        assert(state, .end, reducedTo: state.with {
            $0.phase = .ending
            $0[status: piece] = .stopping
        })
    }

    @Test(arguments: stopOrder)
    func endStopsTheFirstPieceStillUp_effect(_ piece: SessionState.Piece) {

        assert(recording(withDown: piecesStopped(before: piece)), .end, effect: stopEffect(piece))
    }

    @Test func endWithOnlyFolderAndProcessesUpEnds_state() {

        let state = recording(withDown: stopOrder)
        assert(state, .end, reducedTo: state.with {
            $0.folder = .closed
            $0.processes = .closed
            $0.phase = .ended
        })
    }

    @Test func endWithOnlyFolderAndProcessesUpEnds_effect() {

        assert(recording(withDown: stopOrder), .end, effect: nil)
    }

    @Test func endBeforeAnythingIsUpEnds_state() {

        for state in [idle(), checkingModels()] {
            assert(state, .end, reducedTo: state.with { $0.phase = .ended })
        }
    }

    @Test func endBeforeAnythingIsUpEnds_effect() {

        for state in [idle(), checkingModels()] {
            assert(state, .end, effect: nil)
        }
    }

    @Test(arguments: stopOrder, results)
    func stopResultStopsTheNextPiece_state(_ piece: SessionState.Piece, _ error: String?) {

        let state = stopping(piece)
        assert(state, stopResult(piece, error: error), reducedTo: state.with {
            $0[status: piece] = .closed
            if let error { $0.fail(piece, error) }
            $0.goOn(after: piece)
        })
    }

    @Test(arguments: stopOrder, results)
    func stopResultStopsTheNextPiece_effect(_ piece: SessionState.Piece, _ error: String?) {

        assert(stopping(piece), stopResult(piece, error: error), effect: nextStopEffect(after: piece))
    }

    @Test(arguments: [SessionState.Phase.ending, .ended])
    func repeatedEndIsIgnored_state(_ phase: SessionState.Phase) {

        let state = scrambled(phase)
        assert(state, .end, reducedTo: state)
    }

    @Test(arguments: [SessionState.Phase.ending, .ended])
    func repeatedEndIsIgnored_effect(_ phase: SessionState.Phase) {

        assert(scrambled(phase), .end, effect: nil)
    }

    // MARK: Ending waits

    @Test(arguments: bringUpOrder)
    func endWaitsForAPieceStarting_state(_ piece: SessionState.Piece) {

        let state = bringingUp(starting: piece)
        assert(state, .end, reducedTo: state.with { $0.phase = .ending })
    }

    @Test(arguments: bringUpOrder)
    func endWaitsForAPieceStarting_effect(_ piece: SessionState.Piece) {

        assert(bringingUp(starting: piece), .end, effect: nil)
    }

    @Test(arguments: sides)
    func endWaitsForACaptureStopping_state(_ side: SessionSide) {

        let state = recording().with { $0[status: .capture(side)] = .stopping }
        assert(state, .end, reducedTo: state.with { $0.phase = .ending })
    }

    @Test(arguments: sides)
    func endWaitsForACaptureStopping_effect(_ side: SessionSide) {

        assert(recording().with { $0[status: .capture(side)] = .stopping }, .end, effect: nil)
    }

    @Test func endWaitsForHeldLiveText_state() {

        let state = holdingLiveText()
        assert(state, .end, reducedTo: state.with { $0.phase = .ending })
    }

    @Test func endWaitsForHeldLiveText_effect() {

        assert(holdingLiveText(), .end, effect: nil)
    }

    @Test(arguments: heldStarts)
    func startResultWhileEndingStopsTheFirstPieceUp_state(_ start: HeldStart) {

        let state = endingWhileStarting(start.piece)
        assert(state, startResult(start.piece, error: nil), reducedTo: state.with {
            $0[status: start.piece] = .up
            $0[status: start.firstStop] = .stopping
        })
    }

    @Test(arguments: heldStarts)
    func startResultWhileEndingStopsTheFirstPieceUp_effect(_ start: HeldStart) {

        assert(endingWhileStarting(start.piece), startResult(start.piece, error: nil), effect: stopEffect(start.firstStop))
    }

    @Test func failedStartWhileEndingWithNothingElseUpEnds_state() {

        let state = endingWhileStarting(.track(.microphone))
        let error = anyError()
        assert(state, .trackFinished(.microphone, error: error), reducedTo: state.with {
            $0.microphoneTrack = .down
            $0.fail(.track(.microphone), error)
            $0.folder = .closed
            $0.processes = .closed
            $0.phase = .ended
        })
    }

    @Test func failedStartWhileEndingWithNothingElseUpEnds_effect() {

        assert(endingWhileStarting(.track(.microphone)), .trackFinished(.microphone, error: anyError()), effect: nil)
    }

    @Test func createdFolderWhileEndingEnds_state() {

        let state = endingWhileStarting(.folder)
        let folder = anyFolder()
        assert(state, .folderFinished(error: nil, folder: folder), reducedTo: state.with {
            $0.folder = .closed
            $0.recordedFolder = folder
            $0.phase = .ended
        })
    }

    @Test func createdFolderWhileEndingEnds_effect() {

        assert(endingWhileStarting(.folder), .folderFinished(error: nil, folder: anyFolder()), effect: nil)
    }

    @Test func folderFailureWhileEndingEnds_state() {

        let state = endingWhileStarting(.folder)
        let error = anyError()
        assert(state, .folderFinished(error: error), reducedTo: state.with {
            $0.folder = .down
            $0.fail(.folder, error)
            $0.cannotRecord = "folder: \(error)"
            $0.phase = .ended
        })
    }

    @Test func folderFailureWhileEndingEnds_effect() {

        assert(endingWhileStarting(.folder), .folderFinished(error: anyError()), effect: nil)
    }

    @Test func selectedProcessesWhileEndingEnd_state() {

        let state = endingWhileStarting(.processes)
        let selection = anySelection()
        assert(state, .processesFinished(selection: selection, error: nil), reducedTo: state.with {
            $0.folder = .closed
            $0.processes = .closed
            $0.processSelection = selection
            $0.phase = .ended
        })
    }

    @Test func selectedProcessesWhileEndingEnd_effect() {

        assert(endingWhileStarting(.processes), .processesFinished(selection: anySelection(), error: nil), effect: nil)
    }

    @Test(arguments: [false, true])
    func heldLiveTextReplyWhileEndingGoesOn_state(_ stale: Bool) {

        let state = holdingLiveText(stale: stale).with { $0.phase = .ending }
        assert(state, .liveTextSet(request: state.pendingLiveText!, error: nil), reducedTo: state.with {
            $0.pendingLiveText = nil
            $0.microphoneCapture = .stopping
        })
    }

    @Test(arguments: [false, true])
    func heldLiveTextReplyWhileEndingGoesOn_effect(_ stale: Bool) {

        let state = holdingLiveText(stale: stale).with { $0.phase = .ending }
        assert(state, .liveTextSet(request: state.pendingLiveText!, error: nil), effect: .stopCapture(.microphone))
    }
}
