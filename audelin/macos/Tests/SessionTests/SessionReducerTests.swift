import Foundation
import Session
import Testing

struct SessionReducerTests {

    // MARK: Bring-up order

    @Test(arguments: [true, false])
    func beginChecksModels_state(_ wanted: Bool) {

        let state = makeIdle().with { $0.audioWarning = .callSilent }
        assert(state, .begin(liveText: wanted)) {
            $0.phase = .bringingUp
            $0.wantedLiveText = wanted
            $0.audioWarning = nil
        }
    }

    @Test(arguments: [true, false])
    func beginChecksModels_effect(_ wanted: Bool) {

        assert(makeIdle(), .begin(liveText: wanted), delivers: .checkModels)
    }

    @Test func modelsOnDiskCreateTheFolder_state() {

        let state = makeCheckingModels()
        assert(state, .modelsChecked(missing: [])) { $0.folder = .starting }
    }

    @Test func modelsOnDiskCreateTheFolder_effect() {

        assert(makeCheckingModels(), .modelsChecked(missing: []), delivers: .createFolder)
    }

    @Test(arguments: missingModels)
    func missingModelsCannotRecord_state(_ names: [String], _ listed: String) {

        let state = makeCheckingModels()
        assert(state, .modelsChecked(missing: names)) {
            $0.failures.append(.init(piece: "model", message: "\(listed) not on disk"))
            $0.cannotRecord = "model: \(listed) not on disk"
        }
    }

    @Test(arguments: missingModels)
    func missingModelsCannotRecord_effect(_ names: [String], _: String) {

        assert(makeCheckingModels(), .modelsChecked(missing: names), delivers: nil)
    }

    @Test func createdFolderIsKeptAndSelectsProcesses_state() {

        let state = makeBringingUp(starting: .folder)
        let folder = anyFolder()
        assert(state, .folderFinished(error: nil, folder: folder)) {
            $0.folder = .up
            $0.recordedFolder = folder
            $0.processes = .starting
        }
    }

    @Test func createdFolderIsKeptAndSelectsProcesses_effect() {

        assert(makeBringingUp(starting: .folder), .folderFinished(error: nil, folder: anyFolder()), delivers: .selectProcesses)
    }

    @Test func folderFailureCannotRecord_state() {

        let state = makeBringingUp(starting: .folder)
        let error = anyError()
        assert(state, .folderFinished(error: error)) {
            $0.folder = .down
            $0.fail(.folder, error)
            $0.cannotRecord = "folder: \(error)"
        }
    }

    @Test func folderFailureCannotRecord_effect() {

        assert(makeBringingUp(starting: .folder), .folderFinished(error: anyError()), delivers: nil)
    }

    @Test func selectedProcessesAreKeptAndOpenTheMicrophoneTrack_state() {

        let state = makeBringingUp(starting: .processes)
        let selection = anySelection()
        assert(state, .processesFinished(selection: selection, error: nil)) {
            $0.processes = .up
            $0.processSelection = selection
            $0.microphoneTrack = .starting
        }
    }

    @Test func selectedProcessesAreKeptAndOpenTheMicrophoneTrack_effect() {

        assert(makeBringingUp(starting: .processes), .processesFinished(selection: anySelection(), error: nil), delivers: .openTrack(.microphone))
    }

    @Test func failedProcessSelectionIsNamedAndOpensTheMicrophoneTrack_state() {

        let state = makeBringingUp(starting: .processes)
        let error = anyError()
        assert(state, .processesFinished(selection: nil, error: error)) {
            $0.processes = .down
            $0.fail(.processes, error)
            $0.processSelection = nil
            $0.microphoneTrack = .starting
        }
    }

    @Test func failedProcessSelectionIsNamedAndOpensTheMicrophoneTrack_effect() {

        assert(makeBringingUp(starting: .processes), .processesFinished(selection: nil, error: anyError()), delivers: .openTrack(.microphone))
    }

    @Test(arguments: openingSteps, results)
    func pieceResultStartsTheNextPiece_state(_ step: OpeningStep, _ error: String?) {

        let state = makeBringingUp(starting: step.piece)
        assert(state, startResult(step.piece, error: error)) {
            $0[status: step.piece] = error == nil ? .up : .down
            if let error { $0.fail(step.piece, error) }
            $0[status: step.next] = .starting
        }
    }

    @Test(arguments: openingSteps, results)
    func pieceResultStartsTheNextPiece_effect(_ step: OpeningStep, _ error: String?) {

        assert(makeBringingUp(starting: step.piece), startResult(step.piece, error: error), delivers: step.effect)
    }

    @Test(arguments: results, [true, false])
    func transcriptResultStartsCallTextAsWanted_state(_ error: String?, _ wanted: Bool) {

        let state = makeBringingUp(starting: .transcript).with { $0.wantedLiveText = wanted }
        assert(state, .transcriptFinished(error: error)) {
            $0.transcript = error == nil ? .up : .down
            if let error { $0.fail(.transcript, error) }
            $0.callText = .starting
        }
    }

    @Test(arguments: results, [true, false])
    func transcriptResultStartsCallTextAsWanted_effect(_ error: String?, _ wanted: Bool) {

        let state = makeBringingUp(starting: .transcript).with { $0.wantedLiveText = wanted }
        assert(state, .transcriptFinished(error: error), delivers: .startCallText(enabled: wanted))
    }

    @Test(arguments: unavailable(.microphone))
    func unavailableMicrophoneSkipsItsCapture_state(_ health: [SessionState.Piece: SessionState.Health]) {

        let state = makeBringingUp(starting: .callText).with { $0.health = health }
        assert(state, .callTextFinished(error: nil)) {
            $0.callText = .up
            $0.callCapture = .starting
        }
    }

    @Test(arguments: unavailable(.microphone))
    func unavailableMicrophoneSkipsItsCapture_effect(_ health: [SessionState.Piece: SessionState.Health]) {

        let selection = anySelection()
        let state = makeBringingUp(starting: .callText).with {
            $0.health = health
            $0.processSelection = selection
        }
        assert(state, .callTextFinished(error: nil), delivers: .startCallCapture(selection: .chosen(selection)))
    }

    @Test(arguments: results)
    func microphoneCaptureResultStartsTheCallCapture_state(_ error: String?) {

        let state = makeBringingUp(starting: .capture(.microphone))
        assert(state, .captureFinished(.microphone, error: error)) {
            $0.microphoneCapture = error == nil ? .up : .down
            if let error { $0.fail(.capture(.microphone), error) }
            $0.callCapture = .starting
        }
    }

    @Test(arguments: results)
    func microphoneCaptureResultStartsTheCallCapture_effect(_ error: String?) {

        let selection = anySelection()
        let state = makeBringingUp(starting: .capture(.microphone)).with { $0.processSelection = selection }
        assert(state, .captureFinished(.microphone, error: error), delivers: .startCallCapture(selection: .chosen(selection)))
    }

    @Test func callCaptureWithoutChosenAppsHearsEveryAppButAudelin_state() {

        let state = makeBringingUp(starting: .capture(.microphone)).with { $0.processSelection = nil }
        assert(state, .captureFinished(.microphone, error: nil)) {
            $0.microphoneCapture = .up
            $0.callCapture = .starting
        }
    }

    @Test func callCaptureWithoutChosenAppsHearsEveryAppButAudelin_effect() {

        let state = makeBringingUp(starting: .capture(.microphone)).with { $0.processSelection = nil }
        assert(state, .captureFinished(.microphone, error: nil), delivers: .startCallCapture(selection: .everyAppButAudelin))
    }

    @Test(arguments: unavailable(.call))
    func unavailableCallSideSkipsItsCapture_state(_ health: [SessionState.Piece: SessionState.Health]) {

        let state = makeBringingUp(starting: .capture(.microphone)).with { $0.health = health }
        assert(state, .captureFinished(.microphone, error: nil)) {
            $0.microphoneCapture = .up
            $0.phase = .recording
        }
    }

    @Test(arguments: unavailable(.call))
    func unavailableCallSideSkipsItsCapture_effect(_ health: [SessionState.Piece: SessionState.Health]) {

        let state = makeBringingUp(starting: .capture(.microphone)).with { $0.health = health }
        assert(state, .captureFinished(.microphone, error: nil), delivers: nil)
    }

    @Test func callCaptureCompletesBringUp_state() {

        let state = makeBringingUp(starting: .capture(.call))
        assert(state, .captureFinished(.call, error: nil)) {
            $0.callCapture = .up
            $0.phase = .recording
        }
    }

    @Test func callCaptureCompletesBringUp_effect() {

        assert(makeBringingUp(starting: .capture(.call)), .captureFinished(.call, error: nil), delivers: nil)
    }

    @Test func failedCallCaptureRecordsOnTheMicrophone_state() {

        let state = makeBringingUp(starting: .capture(.call))
        let error = anyError()
        assert(state, .captureFinished(.call, error: error)) {
            $0.callCapture = .down
            $0.fail(.capture(.call), error)
            $0.phase = .recording
        }
    }

    @Test func failedCallCaptureRecordsOnTheMicrophone_effect() {

        assert(makeBringingUp(starting: .capture(.call)), .captureFinished(.call, error: anyError()), delivers: nil)
    }

    // MARK: Bring-down order

    @Test(arguments: stopOrder)
    func endStopsTheFirstPieceStillUp_state(_ piece: SessionState.Piece) {

        let state = makeRecording(withDown: piecesStopped(before: piece))
        assert(state, .end) {
            $0.phase = .ending
            $0[status: piece] = .stopping
        }
    }

    @Test(arguments: stopOrder)
    func endStopsTheFirstPieceStillUp_effect(_ piece: SessionState.Piece) {

        assert(makeRecording(withDown: piecesStopped(before: piece)), .end, delivers: stopEffect(piece))
    }

    @Test func endWithOnlyFolderAndProcessesUpEnds_state() {

        let state = makeRecording(withDown: stopOrder)
        assert(state, .end) {
            $0.folder = .closed
            $0.processes = .closed
            $0.phase = .ended
        }
    }

    @Test func endWithOnlyFolderAndProcessesUpEnds_effect() {

        assert(makeRecording(withDown: stopOrder), .end, delivers: nil)
    }

    @Test func endBeforeAnythingIsUpEnds_state() {

        for state in [makeIdle(), makeCheckingModels()] {
            assert(state, .end) { $0.phase = .ended }
        }
    }

    @Test func endBeforeAnythingIsUpEnds_effect() {

        for state in [makeIdle(), makeCheckingModels()] {
            assert(state, .end, delivers: nil)
        }
    }

    @Test(arguments: stopOrder, results)
    func stopResultStopsTheNextPiece_state(_ piece: SessionState.Piece, _ error: String?) {

        let state = makeStopping(piece)
        assert(state, stopResult(piece, error: error)) {
            $0[status: piece] = .closed
            if let error { $0.fail(piece, error) }
            $0.goOn(after: piece)
        }
    }

    @Test(arguments: stopOrder, results)
    func stopResultStopsTheNextPiece_effect(_ piece: SessionState.Piece, _ error: String?) {

        assert(makeStopping(piece), stopResult(piece, error: error), delivers: nextStopEffect(after: piece))
    }

    @Test(arguments: [SessionState.Phase.ending, .ended])
    func repeatedEndIsIgnored_state(_ phase: SessionState.Phase) {

        let state = makeScrambled(phase)
        assert(state, .end)
    }

    @Test(arguments: [SessionState.Phase.ending, .ended])
    func repeatedEndIsIgnored_effect(_ phase: SessionState.Phase) {

        assert(makeScrambled(phase), .end, delivers: nil)
    }

    // MARK: Ending waits

    @Test(arguments: bringUpOrder)
    func endWaitsForAPieceStarting_state(_ piece: SessionState.Piece) {

        let state = makeBringingUp(starting: piece)
        assert(state, .end) { $0.phase = .ending }
    }

    @Test(arguments: bringUpOrder)
    func endWaitsForAPieceStarting_effect(_ piece: SessionState.Piece) {

        assert(makeBringingUp(starting: piece), .end, delivers: nil)
    }

    @Test(arguments: sides)
    func endWaitsForACaptureStopping_state(_ side: SessionSide) {

        let state = makeRecording().with { $0[status: .capture(side)] = .stopping }
        assert(state, .end) { $0.phase = .ending }
    }

    @Test(arguments: sides)
    func endWaitsForACaptureStopping_effect(_ side: SessionSide) {

        assert(makeRecording().with { $0[status: .capture(side)] = .stopping }, .end, delivers: nil)
    }

    @Test func endWaitsForHeldLiveText_state() {

        let state = makeHoldingLiveText()
        assert(state, .end) { $0.phase = .ending }
    }

    @Test func endWaitsForHeldLiveText_effect() {

        assert(makeHoldingLiveText(), .end, delivers: nil)
    }

    @Test(arguments: heldStarts)
    func startResultWhileEndingStopsTheFirstPieceUp_state(_ start: HeldStart) {

        let state = makeEndingWhileStarting(start.piece)
        assert(state, startResult(start.piece, error: nil)) {
            $0[status: start.piece] = .up
            $0[status: start.firstStop] = .stopping
        }
    }

    @Test(arguments: heldStarts)
    func startResultWhileEndingStopsTheFirstPieceUp_effect(_ start: HeldStart) {

        assert(makeEndingWhileStarting(start.piece), startResult(start.piece, error: nil), delivers: stopEffect(start.firstStop))
    }

    @Test(arguments: heldStarts.filter { $0.piece != .track(.microphone) })
    func failedStartWhileEndingStopsTheFirstPieceStillUp_state(_ start: HeldStart) {

        let state = makeEndingWhileStarting(start.piece)
        let error = anyError()
        let firstStop = firstPieceUp(in: state, besides: start.piece)
        assert(state, startResult(start.piece, error: error)) {
            $0[status: start.piece] = .down
            $0.fail(start.piece, error)
            $0[status: firstStop] = .stopping
        }
    }

    @Test(arguments: heldStarts.filter { $0.piece != .track(.microphone) })
    func failedStartWhileEndingStopsTheFirstPieceStillUp_effect(_ start: HeldStart) {

        let state = makeEndingWhileStarting(start.piece)
        let firstStop = firstPieceUp(in: state, besides: start.piece)
        assert(state, startResult(start.piece, error: anyError()), delivers: stopEffect(firstStop))
    }

    @Test func failedProcessesWhileEndingEnd_state() {

        let state = makeEndingWhileStarting(.processes)
        let error = anyError()
        assert(state, .processesFinished(selection: nil, error: error)) {
            $0.processes = .down
            $0.fail(.processes, error)
            $0.processSelection = nil
            $0.folder = .closed
            $0.phase = .ended
        }
    }

    @Test func failedProcessesWhileEndingEnd_effect() {

        assert(makeEndingWhileStarting(.processes), .processesFinished(selection: nil, error: anyError()), delivers: nil)
    }

    @Test func failedStartWhileEndingWithNothingElseUpEnds_state() {

        let state = makeEndingWhileStarting(.track(.microphone))
        let error = anyError()
        assert(state, .trackFinished(.microphone, error: error)) {
            $0.microphoneTrack = .down
            $0.fail(.track(.microphone), error)
            $0.folder = .closed
            $0.processes = .closed
            $0.phase = .ended
        }
    }

    @Test func failedStartWhileEndingWithNothingElseUpEnds_effect() {

        assert(makeEndingWhileStarting(.track(.microphone)), .trackFinished(.microphone, error: anyError()), delivers: nil)
    }

    @Test func createdFolderWhileEndingEnds_state() {

        let state = makeEndingWhileStarting(.folder)
        let folder = anyFolder()
        assert(state, .folderFinished(error: nil, folder: folder)) {
            $0.folder = .closed
            $0.recordedFolder = folder
            $0.phase = .ended
        }
    }

    @Test func createdFolderWhileEndingEnds_effect() {

        assert(makeEndingWhileStarting(.folder), .folderFinished(error: nil, folder: anyFolder()), delivers: nil)
    }

    @Test func folderFailureWhileEndingEnds_state() {

        let state = makeEndingWhileStarting(.folder)
        let error = anyError()
        assert(state, .folderFinished(error: error)) {
            $0.folder = .down
            $0.fail(.folder, error)
            $0.cannotRecord = "folder: \(error)"
            $0.phase = .ended
        }
    }

    @Test func folderFailureWhileEndingEnds_effect() {

        assert(makeEndingWhileStarting(.folder), .folderFinished(error: anyError()), delivers: nil)
    }

    @Test func selectedProcessesWhileEndingEnd_state() {

        let state = makeEndingWhileStarting(.processes)
        let selection = anySelection()
        assert(state, .processesFinished(selection: selection, error: nil)) {
            $0.folder = .closed
            $0.processes = .closed
            $0.processSelection = selection
            $0.phase = .ended
        }
    }

    @Test func selectedProcessesWhileEndingEnd_effect() {

        assert(makeEndingWhileStarting(.processes), .processesFinished(selection: anySelection(), error: nil), delivers: nil)
    }

    @Test(arguments: [false, true])
    func heldLiveTextReplyWhileEndingGoesOn_state(_ stale: Bool) {

        let state = makeHoldingLiveText(stale: stale).with { $0.phase = .ending }
        assert(state, .liveTextSet(request: state.pendingLiveText!, error: nil)) {
            $0.pendingLiveText = nil
            $0.microphoneCapture = .stopping
        }
    }

    @Test(arguments: [false, true])
    func heldLiveTextReplyWhileEndingGoesOn_effect(_ stale: Bool) {

        let state = makeHoldingLiveText(stale: stale).with { $0.phase = .ending }
        assert(state, .liveTextSet(request: state.pendingLiveText!, error: nil), delivers: .stopCapture(.microphone))
    }
}
