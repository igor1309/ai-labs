import Session
import Synchronization
import Testing

struct SessionFormattingTests {

    @Test func constructionDoesNotFormat() {

        let (_, spy) = makeSUT()
        #expect(spy.calls == [])
    }

    @Test(arguments: namedPieces)
    func everyPieceFailureUsesTheInjectedFailure(_ entry: NamedPiece) {

        let (sut, spy) = makeSUT()
        let state = makeBringingUp(starting: .folder)
        let event = SessionEvent.pieceFailed(entry.piece, error: "piece error")
        assert(state, event, reducer: sut) {
            $0.health[entry.piece] = .failed("piece error")
            $0.failures.append(spy.failure)
            if entry.piece == .folder { $0.cannotRecord = spy.cannotRecord }
        }
        var calls: [FormattingSpy.Call] = [.failure(.piece(entry.piece, error: "piece error"))]
        if entry.piece == .folder { calls.append(.cannotRecord(.folderFailure("piece error"))) }
        #expect(spy.calls == calls)
        assert(state, event, delivers: nil, reducer: sut)
        #expect(spy.calls == calls + calls)
    }

    @Test(arguments: sides)
    func accessLossUsesTheInjectedFailure(_ side: SessionSide) {

        let (sut, spy) = makeSUT()
        let state = makeRecording()
        let event = SessionEvent.accessChanged(side, available: false)
        assert(state, event, reducer: sut) {
            $0.health[.access(side)] = .accessLost
            $0.failures.append(spy.failure)
        }
        let calls: [FormattingSpy.Call] = [.failure(.piece(.access(side), error: "access lost"))]
        #expect(spy.calls == calls)
        assert(state, event, delivers: nil, reducer: sut)
        #expect(spy.calls == calls + calls)
    }

    @Test(arguments: [["model B"], ["model B", "model A"], ["model A", "model B", "model A"]])
    func missingModelsKeepTheirOrderAndUseBothInjectedValues(_ missing: [String]) {

        let (sut, spy) = makeSUT()
        let state = makeCheckingModels()
        let event = SessionEvent.modelsChecked(missing: missing)
        assert(state, event, reducer: sut) {
            $0.failures.append(spy.failure)
            $0.cannotRecord = spy.cannotRecord
        }
        let calls: [FormattingSpy.Call] = [.failure(.missingModels(missing)), .cannotRecord(.missingModels(missing))]
        #expect(spy.calls == calls)
        assert(state, event, delivers: nil, reducer: sut)
        #expect(spy.calls == calls + calls)
    }

    @Test(arguments: [SessionState.Phase.bringingUp, .ending])
    func folderCompletionUsesBothInjectedValues(_ phase: SessionState.Phase) {

        let (sut, spy) = makeSUT()
        let state = makeBringingUp(starting: .folder).with { $0.phase = phase }
        let event = SessionEvent.folderFinished(error: "folder error")
        assert(state, event, reducer: sut) {
            $0.folder = .down
            $0.health[.folder] = .failed("folder error")
            $0.failures.append(spy.failure)
            $0.cannotRecord = spy.cannotRecord
            if phase == .ending { $0.phase = .ended }
        }
        let calls: [FormattingSpy.Call] = [.failure(.piece(.folder, error: "folder error")), .cannotRecord(.folderFailure("folder error"))]
        #expect(spy.calls == calls)
        assert(state, event, delivers: nil, reducer: sut)
        #expect(spy.calls == calls + calls)
    }

    @Test func noTrackAtBringUpUsesTheInjectedReason() {

        let (sut, spy) = makeSUT()
        let state = makeBringingUp(starting: .capture(.call)).with {
            $0.microphoneTrack = .down
            $0.callTrack = .down
        }
        let event = SessionEvent.captureFinished(.call, error: nil)
        assert(state, event, reducer: sut) {
            $0.callCapture = .up
            $0.cannotRecord = spy.cannotRecord
        }
        #expect(spy.calls == [.cannotRecord(.noTrack)])
        assert(state, event, delivers: nil, reducer: sut)
        #expect(spy.calls == [.cannotRecord(.noTrack), .cannotRecord(.noTrack)])
    }

    @Test(arguments: sides)
    func losingTheLastTrackUsesTheInjectedReason(_ side: SessionSide) {

        let (sut, spy) = makeSUT()
        let state = makeRecording().with { $0[status: .track(side.other)] = .down }
        let event = SessionEvent.pieceFailed(.track(side), error: "last track")
        assert(state, event, reducer: sut) {
            $0.health[.track(side)] = .failed("last track")
            $0.failures.append(spy.failure)
            $0.cannotRecord = spy.cannotRecord
            $0.phase = .bringingUp
        }
        let calls: [FormattingSpy.Call] = [.failure(.piece(.track(side), error: "last track")), .cannotRecord(.noTrack)]
        #expect(spy.calls == calls)
        assert(state, event, delivers: nil, reducer: sut)
        #expect(spy.calls == calls + calls)
    }

    @Test(arguments: bringUpOrder.filter { $0 != .folder && $0 != .processes })
    func startFailuresUseTheInjectedFailure(_ piece: SessionState.Piece) {

        let (sut, spy) = makeSUT()
        let state = makeEndingWhileStarting(piece)
        let event = startResult(piece, error: "start error")
        let next = stopOrder.first { state[status: $0] == .up }
        assert(state, event, reducer: sut) {
            $0[status: piece] = .down
            $0.health[piece] = .failed("start error")
            $0.failures.append(spy.failure)
            if let next { $0[status: next] = .stopping }
            else {
                $0.folder = .closed
                $0.processes = .closed
                $0.phase = .ended
            }
        }
        let calls: [FormattingSpy.Call] = [.failure(.piece(piece, error: "start error"))]
        #expect(spy.calls == calls)
        assert(state, event, delivers: next.map(stopEffect), reducer: sut)
        #expect(spy.calls == calls + calls)
    }

    @Test(arguments: [false, true])
    func processSelectionFormatsOnlyItsFailure(_ failed: Bool) {

        let (sut, spy) = makeSUT()
        let state = makeBringingUp(starting: .processes)
        let selection = anySelection()
        let event = SessionEvent.processesFinished(selection: selection, error: failed ? "selection error" : nil)
        assert(state, event, reducer: sut) {
            $0.processes = failed ? .down : .up
            $0.processSelection = selection
            $0.microphoneTrack = .starting
            if failed {
                $0.health[.processes] = .failed("selection error")
                $0.failures.append(spy.failure)
            }
        }
        let calls: [FormattingSpy.Call] = failed ? [.failure(.piece(.processes, error: "selection error"))] : []
        #expect(spy.calls == calls)
        assert(state, event, delivers: .openTrack(.microphone), reducer: sut)
        #expect(spy.calls == calls + calls)
    }

    @Test(arguments: stopOrder)
    func stopFailuresUseTheInjectedFailure(_ piece: SessionState.Piece) {

        let (sut, spy) = makeSUT()
        let state = makeStopping(piece)
        let event = stopResult(piece, error: "stop error")
        assert(state, event, reducer: sut) {
            $0[status: piece] = .closed
            $0.health[piece] = .failed("stop error")
            $0.failures.append(spy.failure)
            $0.goOn(after: piece)
        }
        let calls: [FormattingSpy.Call] = [.failure(.piece(piece, error: "stop error"))]
        #expect(spy.calls == calls)
        assert(state, event, delivers: nextStopEffect(after: piece), reducer: sut)
        #expect(spy.calls == calls + calls)
    }

    @Test func currentLiveTextFailureUsesTheInjectedFailure() {

        let (sut, spy) = makeSUT()
        let state = makeHoldingLiveText()
        let event = SessionEvent.liveTextSet(request: state.pendingLiveText!, error: "live error")
        assert(state, event, reducer: sut) {
            $0.pendingLiveText = nil
            $0.health[.callText] = .failed("live error")
            $0.failures.append(spy.failure)
        }
        let calls: [FormattingSpy.Call] = [.failure(.piece(.callText, error: "live error"))]
        #expect(spy.calls == calls)
        assert(state, event, delivers: nil, reducer: sut)
        #expect(spy.calls == calls + calls)
    }

    @Test func ignoredEventsDoNotFormat() {

        let (sut, spy) = makeSUT()
        let cases = eventsInTheWrongPhase() + resultsNotAwaited() + unmatchedReplies()
        for (state, event) in cases {
            assert(state, event, reducer: sut)
            assert(state, event, delivers: nil, reducer: sut)
        }
        #expect(spy.calls == [])
    }

    @Test func staleLiveTextFailureDoesNotFormat() {

        let (sut, spy) = makeSUT()
        let state = makeHoldingLiveText(stale: true)
        let request = SessionState.LiveTextRequest(id: state.liveTextRequestID, enabled: state.wantedLiveText)
        let event = SessionEvent.liveTextSet(request: state.pendingLiveText!, error: "stale error")
        assert(state, event, reducer: sut) { $0.pendingLiveText = request }
        assert(state, event, delivers: .setLiveText(request), reducer: sut)
        #expect(spy.calls == [])
    }

    @Test func successfulModelCheckDoesNotFormat() {

        let (sut, spy) = makeSUT()
        let state = makeCheckingModels()
        assert(state, .modelsChecked(missing: []), reducer: sut) { $0.folder = .starting }
        assert(state, .modelsChecked(missing: []), delivers: .createFolder, reducer: sut)
        #expect(spy.calls == [])
    }

    @Test func successfulFolderCreationDoesNotFormat() {

        let (sut, spy) = makeSUT()
        let state = makeBringingUp(starting: .folder)
        let folder = anyFolder()
        let event = SessionEvent.folderFinished(error: nil, folder: folder)
        assert(state, event, reducer: sut) {
            $0.folder = .up
            $0.recordedFolder = folder
            $0.processes = .starting
        }
        assert(state, event, delivers: .selectProcesses, reducer: sut)
        #expect(spy.calls == [])
    }

    @Test(arguments: bringUpOrder.filter { $0 != .folder && $0 != .processes })
    func successfulStartsDoNotFormat(_ piece: SessionState.Piece) {

        let (sut, spy) = makeSUT()
        let state = makeEndingWhileStarting(piece)
        let event = startResult(piece, error: nil)
        let next = stopOrder.first { $0 == piece || state[status: $0] == .up }!
        assert(state, event, reducer: sut) {
            $0[status: piece] = .up
            $0[status: next] = .stopping
        }
        assert(state, event, delivers: stopEffect(next), reducer: sut)
        #expect(spy.calls == [])
    }

    @Test(arguments: stopOrder)
    func successfulStopsDoNotFormat(_ piece: SessionState.Piece) {

        let (sut, spy) = makeSUT()
        let state = makeStopping(piece)
        let event = stopResult(piece, error: nil)
        assert(state, event, reducer: sut) {
            $0[status: piece] = .closed
            $0.goOn(after: piece)
        }
        assert(state, event, delivers: nextStopEffect(after: piece), reducer: sut)
        #expect(spy.calls == [])
    }

    @Test func usableTrackAtBringUpDoesNotFormat() {

        let (sut, spy) = makeSUT()
        let state = makeBringingUp(starting: .capture(.call))
        assert(state, .captureFinished(.call, error: nil), reducer: sut) {
            $0.callCapture = .up
            $0.phase = .recording
        }
        assert(state, .captureFinished(.call, error: nil), delivers: nil, reducer: sut)
        #expect(spy.calls == [])
    }

    @Test func successfulLiveTextReplyDoesNotFormat() {

        let (sut, spy) = makeSUT()
        let state = makeHoldingLiveText()
        let event = SessionEvent.liveTextSet(request: state.pendingLiveText!, error: nil)
        assert(state, event, reducer: sut) { $0.pendingLiveText = nil }
        assert(state, event, delivers: nil, reducer: sut)
        #expect(spy.calls == [])
    }

    @Test(arguments: namedPieces)
    func productionFailureWording(_ entry: NamedPiece) {

        #expect(SessionFormatting.failure(.piece(entry.piece, error: "the error")) == .init(piece: entry.name, message: "the error"))
    }

    @Test(arguments: [["model B"], ["model B", "model A"], ["model A", "model B", "model A"]])
    func productionMissingModelsWording(_ missing: [String]) {

        let message = missing.joined(separator: ", ") + " not on disk"
        #expect(SessionFormatting.failure(.missingModels(missing)) == .init(piece: "model", message: message))
        #expect(SessionFormatting.cannotRecord(.missingModels(missing)) == "model: " + message)
    }

    @Test func productionCannotRecordWording() {

        #expect(SessionFormatting.cannotRecord(.folderFailure("folder error")) == "folder: folder error")
        #expect(SessionFormatting.cannotRecord(.noTrack) == "no track can record")
    }

    private func makeSUT() -> (SessionReducer, FormattingSpy) {

        let spy = FormattingSpy(failure: .init(piece: "stub piece", message: "stub message"), cannotRecord: "stub reason")
        return (SessionReducer(failure: spy.formatFailure, cannotRecord: spy.formatCannotRecord), spy)
    }
}

private final class FormattingSpy: Sendable {

    enum Call: Equatable {
        case failure(SessionFailureReason)
        case cannotRecord(SessionCannotRecordReason)
    }

    let failure: SessionFailure
    let cannotRecord: String
    private let recorded = Mutex<[Call]>([])
    var calls: [Call] { recorded.withLock { $0 } }

    init(failure: SessionFailure, cannotRecord: String) {

        self.failure = failure
        self.cannotRecord = cannotRecord
    }

    func formatFailure(_ reason: SessionFailureReason) -> SessionFailure {

        recorded.withLock { $0.append(.failure(reason)) }
        return failure
    }

    func formatCannotRecord(_ reason: SessionCannotRecordReason) -> String {

        recorded.withLock { $0.append(.cannotRecord(reason)) }
        return cannotRecord
    }
}

struct NamedPiece: Sendable {
    let piece: SessionState.Piece
    let name: String
}

private let namedPieces: [NamedPiece] = [
    .init(piece: .folder, name: "folder"), .init(piece: .processes, name: "processes"),
    .init(piece: .track(.microphone), name: "microphone track"), .init(piece: .track(.call), name: "call track"),
    .init(piece: .transcript, name: "transcript"), .init(piece: .callText, name: "call text"),
    .init(piece: .capture(.microphone), name: "microphone capture"), .init(piece: .capture(.call), name: "call capture"),
    .init(piece: .access(.microphone), name: "microphone access"), .init(piece: .access(.call), name: "call access"),
]
