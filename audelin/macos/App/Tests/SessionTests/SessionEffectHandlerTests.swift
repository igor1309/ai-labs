import Foundation
import Session
import Synchronization
import Testing

@Suite(.timeLimit(.minutes(1)))
struct SessionEffectHandlerTests {

    @Test func freshHandlerCallsNoCollaborator() {

        let (sut, spies) = makeSUT()
        withExtendedLifetime(sut) { #expect(spies.callCount == 0) }
    }

    @Test(arguments: [[], ["Parakeet v3"], ["Parakeet v3", "Nemotron"]])
    func checkModelsDeliversTheMissingNames(_ missing: [String]) async {

        let (sut, spies) = makeSUT()
        await expect(sut, with: .checkModels, toDeliver: .modelsChecked(missing: missing), on: {
            await spies.models.complete(with: missing)
        })
        #expect(spies.calls == [.missingModels])
    }

    @Test func createFolderDeliversTheFolderMade() async {

        let folder = anyFolder()
        let (sut, spies) = makeSUT()
        await expect(sut, with: .createFolder, toDeliver: .folderFinished(error: nil, folder: folder), on: {
            await spies.folder.complete(with: folder)
        })
        #expect(spies.calls == [.createFolder])
    }

    @Test func createFolderDeliversItsFailure() async {

        let failure = AnyFailure()
        let (sut, spies) = makeSUT()
        await expect(sut, with: .createFolder, toDeliver: .folderFinished(error: failure.description), on: {
            await spies.folder.fail(failure)
        })
        #expect(spies.calls == [.createFolder])
    }

    @Test func selectProcessesDeliversTheSelection() async {

        let selection = SessionProcessSelection(id: UUID().uuidString)
        let (sut, spies) = makeSUT()
        await expect(sut, with: .selectProcesses, toDeliver: .processesFinished(selection: selection, error: nil), on: {
            await spies.processes.complete(with: selection)
        })
        #expect(spies.calls == [.selectProcesses])
    }

    @Test func selectProcessesDeliversItsFailure() async {

        let failure = AnyFailure()
        let (sut, spies) = makeSUT()
        await expect(sut, with: .selectProcesses, toDeliver: .processesFinished(selection: nil, error: failure.description), on: {
            await spies.processes.fail(failure)
        })
        #expect(spies.calls == [.selectProcesses])
    }

    @Test(arguments: sides)
    func openTrackOpensItsSideInTheFolderCreated(_ side: SessionSide) async {

        let folder = anyFolder()
        let (sut, spies) = makeSUT()
        await create(folder, on: sut, spies)
        await expect(sut, with: .openTrack(side), toDeliver: .trackFinished(side, error: nil), on: {
            await spies.track(side).open.complete()
        })
        #expect(spies.calls == [.createFolder, .openTrack(side, in: folder)])
    }

    @Test(arguments: sides)
    func openTrackDeliversItsFailure(_ side: SessionSide) async {

        let failure = AnyFailure()
        let (sut, spies) = makeSUT()
        await create(anyFolder(), on: sut, spies)
        await expect(sut, with: .openTrack(side), toDeliver: .trackFinished(side, error: failure.description), on: {
            await spies.track(side).open.fail(failure)
        })
    }

    @Test(arguments: sides)
    func openTrackBeforeAFolderExistsFailsWithoutCallingTheFile(_ side: SessionSide) async {

        let (sut, spies) = makeSUT()
        await expect(sut, with: .openTrack(side), toDeliver: .trackFinished(side, error: noFolder), on: {})
        #expect(spies.callCount == 0)
    }

    @Test(arguments: sides)
    func openTrackAfterAFailedCreateFailsWithoutCallingTheFile(_ side: SessionSide) async {

        let (sut, spies) = makeSUT()
        await failCreate(on: sut, spies)
        await expect(sut, with: .openTrack(side), toDeliver: .trackFinished(side, error: noFolder), on: {})
        #expect(spies.calls == [.createFolder])
    }

    @Test func openTranscriptOpensInTheFolderCreated() async {

        let folder = anyFolder()
        let (sut, spies) = makeSUT()
        await create(folder, on: sut, spies)
        await expect(sut, with: .openTranscript, toDeliver: .transcriptFinished(error: nil), on: {
            await spies.transcriptOpen.complete()
        })
        #expect(spies.calls == [.createFolder, .openTranscript(in: folder)])
    }

    @Test func openTranscriptDeliversItsFailure() async {

        let failure = AnyFailure()
        let (sut, spies) = makeSUT()
        await create(anyFolder(), on: sut, spies)
        await expect(sut, with: .openTranscript, toDeliver: .transcriptFinished(error: failure.description), on: {
            await spies.transcriptOpen.fail(failure)
        })
    }

    @Test func openTranscriptBeforeAFolderExistsFailsWithoutCallingTheFile() async {

        let (sut, spies) = makeSUT()
        await expect(sut, with: .openTranscript, toDeliver: .transcriptFinished(error: noFolder), on: {})
        #expect(spies.callCount == 0)
    }

    @Test func openTranscriptAfterAFailedCreateFailsWithoutCallingTheFile() async {

        let (sut, spies) = makeSUT()
        await failCreate(on: sut, spies)
        await expect(sut, with: .openTranscript, toDeliver: .transcriptFinished(error: noFolder), on: {})
        #expect(spies.calls == [.createFolder])
    }

    @Test(arguments: [true, false])
    func startCallTextPassesEnabled(_ enabled: Bool) async {

        let (sut, spies) = makeSUT()
        await expect(sut, with: .startCallText(enabled: enabled), toDeliver: .callTextFinished(error: nil), on: {
            await spies.callTextStart.complete()
        })
        #expect(spies.calls == [.startCallText(enabled: enabled)])
    }

    @Test func startCallTextDeliversItsFailure() async {

        let failure = AnyFailure()
        let (sut, spies) = makeSUT()
        await expect(sut, with: .startCallText(enabled: .random()), toDeliver: .callTextFinished(error: failure.description), on: {
            await spies.callTextStart.fail(failure)
        })
    }

    @Test func startMicrophoneCaptureStartsOnlyTheMicrophone() async {

        let (sut, spies) = makeSUT()
        await expect(sut, with: .startMicrophoneCapture, toDeliver: .captureFinished(.microphone, error: nil), on: {
            await spies.microphoneStart.complete()
        })
        #expect(spies.calls == [.startMicrophoneCapture])
    }

    @Test func startMicrophoneCaptureDeliversItsFailure() async {

        let failure = AnyFailure()
        let (sut, spies) = makeSUT()
        await expect(sut, with: .startMicrophoneCapture, toDeliver: .captureFinished(.microphone, error: failure.description), on: {
            await spies.microphoneStart.fail(failure)
        })
    }

    @Test func startCallCapturePassesTheChosenSelection() async {

        let selection = SessionCallCaptureSelection.chosen(.init(id: UUID().uuidString))
        let (sut, spies) = makeSUT()
        await expect(sut, with: .startCallCapture(selection: selection), toDeliver: .captureFinished(.call, error: nil), on: {
            await spies.callStart.complete()
        })
        #expect(spies.calls == [.startCallCapture(selection)])
    }

    @Test func startCallCapturePassesEveryAppButAudelin() async {

        let (sut, spies) = makeSUT()
        await expect(sut, with: .startCallCapture(selection: .everyAppButAudelin), toDeliver: .captureFinished(.call, error: nil), on: {
            await spies.callStart.complete()
        })
        #expect(spies.calls == [.startCallCapture(.everyAppButAudelin)])
    }

    @Test func startCallCaptureDeliversItsFailure() async {

        let failure = AnyFailure()
        let (sut, spies) = makeSUT()
        await expect(sut, with: .startCallCapture(selection: .everyAppButAudelin), toDeliver: .captureFinished(.call, error: failure.description), on: {
            await spies.callStart.fail(failure)
        })
    }

    @Test(arguments: sides)
    func stopCaptureStopsItsSide(_ side: SessionSide) async {

        let (sut, spies) = makeSUT()
        await expect(sut, with: .stopCapture(side), toDeliver: .captureStopped(side, error: nil), on: {
            await spies.captureStop(side).complete()
        })
        #expect(spies.calls == [.stopCapture(side)])
    }

    @Test(arguments: sides)
    func stopCaptureDeliversItsFailure(_ side: SessionSide) async {

        let failure = AnyFailure()
        let (sut, spies) = makeSUT()
        await expect(sut, with: .stopCapture(side), toDeliver: .captureStopped(side, error: failure.description), on: {
            await spies.captureStop(side).fail(failure)
        })
    }

    @Test(arguments: sides)
    func closeTrackClosesItsSide(_ side: SessionSide) async {

        let (sut, spies) = makeSUT()
        await expect(sut, with: .closeTrack(side), toDeliver: .trackClosed(side, error: nil), on: {
            await spies.track(side).close.complete()
        })
        #expect(spies.calls == [.closeTrack(side)])
    }

    @Test(arguments: sides)
    func closeTrackDeliversItsFailure(_ side: SessionSide) async {

        let failure = AnyFailure()
        let (sut, spies) = makeSUT()
        await expect(sut, with: .closeTrack(side), toDeliver: .trackClosed(side, error: failure.description), on: {
            await spies.track(side).close.fail(failure)
        })
    }

    @Test func stopCallTextStopsIt() async {

        let (sut, spies) = makeSUT()
        await expect(sut, with: .stopCallText, toDeliver: .callTextStopped(error: nil), on: {
            await spies.callTextStop.complete()
        })
        #expect(spies.calls == [.stopCallText])
    }

    @Test func stopCallTextDeliversItsFailure() async {

        let failure = AnyFailure()
        let (sut, spies) = makeSUT()
        await expect(sut, with: .stopCallText, toDeliver: .callTextStopped(error: failure.description), on: {
            await spies.callTextStop.fail(failure)
        })
    }

    @Test func closeTranscriptClosesIt() async {

        let (sut, spies) = makeSUT()
        await expect(sut, with: .closeTranscript, toDeliver: .transcriptClosed(error: nil), on: {
            await spies.transcriptClose.complete()
        })
        #expect(spies.calls == [.closeTranscript])
    }

    @Test func closeTranscriptDeliversItsFailure() async {

        let failure = AnyFailure()
        let (sut, spies) = makeSUT()
        await expect(sut, with: .closeTranscript, toDeliver: .transcriptClosed(error: failure.description), on: {
            await spies.transcriptClose.fail(failure)
        })
    }

    @Test(arguments: [true, false])
    func setLiveTextPassesEnabledAndDeliversItsRequest(_ enabled: Bool) async {

        let request = SessionState.LiveTextRequest(id: .random(in: 1 ... 1_000), enabled: enabled)
        let (sut, spies) = makeSUT()
        await expect(sut, with: .setLiveText(request), toDeliver: .liveTextSet(request: request, error: nil), on: {
            await spies.callTextSetEnabled.complete()
        })
        #expect(spies.calls == [.setLiveText(enabled: enabled)])
    }

    @Test func setLiveTextDeliversItsFailureWithItsRequest() async {

        let failure = AnyFailure()
        let request = SessionState.LiveTextRequest(id: .random(in: 1 ... 1_000), enabled: .random())
        let (sut, spies) = makeSUT()
        await expect(sut, with: .setLiveText(request), toDeliver: .liveTextSet(request: request, error: failure.description), on: {
            await spies.callTextSetEnabled.fail(failure)
        })
    }
}

private let noFolder = "folder: folder has not been created"


private struct AnyFailure: Error, CustomStringConvertible {

    let description = UUID().uuidString
}

private func create(_ folder: SessionCallFolder, on sut: SessionEffectHandler, _ spies: Spies) async {

    await expect(sut, with: .createFolder, toDeliver: .folderFinished(error: nil, folder: folder), on: {
        await spies.folder.complete(with: folder)
    })
}

private func failCreate(on sut: SessionEffectHandler, _ spies: Spies) async {

    let failure = AnyFailure()
    await expect(sut, with: .createFolder, toDeliver: .folderFinished(error: failure.description), on: {
        await spies.folder.fail(failure)
    })
}

/// Handles `effect`, runs `action` once the handler waits on a collaborator, and expects `expected`.
private func expect(
    _ sut: SessionEffectHandler, with effect: SessionEffect, toDeliver expected: SessionEvent,
    on action: @escaping @Sendable () async -> Void, sourceLocation: SourceLocation = #_sourceLocation
) async {

    let event = Task { await sut.handle(effect) }
    await action()
    #expect(await event.value == expected, sourceLocation: sourceLocation)
}

private func makeSUT() -> (SessionEffectHandler, Spies) {

    let spies = Spies()
    let sut = SessionEffectHandler(
        models: ModelsSpy(spies: spies),
        folder: FolderSpy(spies: spies),
        processes: ProcessesSpy(spies: spies),
        microphoneCapture: MicrophoneCaptureSpy(spies: spies),
        callCapture: CallCaptureSpy(spies: spies),
        microphoneTrack: TrackSpy(side: .microphone, spies: spies),
        callTrack: TrackSpy(side: .call, spies: spies),
        callText: CallTextSpy(spies: spies),
        transcript: TranscriptSpy(spies: spies)
    )
    return (sut, spies)
}

private enum Call: Equatable, Sendable {

    case missingModels
    case createFolder
    case selectProcesses
    case startMicrophoneCapture
    case startCallCapture(SessionCallCaptureSelection)
    case stopCapture(SessionSide)
    case openTrack(SessionSide, in: SessionCallFolder)
    case closeTrack(SessionSide)
    case startCallText(enabled: Bool)
    case setLiveText(enabled: Bool)
    case stopCallText
    case openTranscript(in: SessionCallFolder)
    case closeTranscript
}

private typealias OperationSpy = Spy<Void, any Error>

private struct TrackSpies {

    let open = OperationSpy(), close = OperationSpy()
}

private struct Spies {

    let log = Log()
    let models = Spy<[String], Never>()
    let folder = Spy<SessionCallFolder, any Error>()
    let processes = Spy<SessionProcessSelection, any Error>()
    let microphoneStart = OperationSpy(), microphoneStop = OperationSpy()
    let callStart = OperationSpy(), callStop = OperationSpy()
    let microphoneTrack = TrackSpies(), callTrack = TrackSpies()
    let callTextStart = OperationSpy(), callTextSetEnabled = OperationSpy(), callTextStop = OperationSpy()
    let transcriptOpen = OperationSpy(), transcriptClose = OperationSpy()

    var calls: [Call] { log.values }
    var callCount: Int { log.values.count }

    func track(_ side: SessionSide) -> TrackSpies { side == .microphone ? microphoneTrack : callTrack }
    func captureStop(_ side: SessionSide) -> OperationSpy { side == .microphone ? microphoneStop : callStop }
}

private struct ModelsSpy: SessionModels {

    let spies: Spies

    func missing() async -> [String] {

        spies.log.append(.missingModels)
        return await spies.models.call()
    }
}

private struct FolderSpy: SessionFolder {

    let spies: Spies

    func create() async throws -> SessionCallFolder {

        spies.log.append(.createFolder)
        return try await spies.folder.call()
    }
}

private struct ProcessesSpy: SessionProcesses {

    let spies: Spies

    func select() async throws -> SessionProcessSelection {

        spies.log.append(.selectProcesses)
        return try await spies.processes.call()
    }
}

private struct MicrophoneCaptureSpy: SessionMicrophoneCapture {

    let spies: Spies

    func start() async throws {

        spies.log.append(.startMicrophoneCapture)
        try await spies.microphoneStart.call()
    }

    func stop() async throws {

        spies.log.append(.stopCapture(.microphone))
        try await spies.microphoneStop.call()
    }
}

private struct CallCaptureSpy: SessionCallCapture {

    let spies: Spies

    func start(selection: SessionCallCaptureSelection) async throws {

        spies.log.append(.startCallCapture(selection))
        try await spies.callStart.call()
    }

    func stop() async throws {

        spies.log.append(.stopCapture(.call))
        try await spies.callStop.call()
    }
}

private struct TrackSpy: SessionTrackFile {

    let side: SessionSide
    let spies: Spies

    func open(in folder: SessionCallFolder) async throws {

        spies.log.append(.openTrack(side, in: folder))
        try await spies.track(side).open.call()
    }

    func close() async throws {

        spies.log.append(.closeTrack(side))
        try await spies.track(side).close.call()
    }
}

private struct CallTextSpy: SessionCallText {

    let spies: Spies

    func start(enabled: Bool) async throws {

        spies.log.append(.startCallText(enabled: enabled))
        try await spies.callTextStart.call()
    }

    func setEnabled(_ enabled: Bool) async throws {

        spies.log.append(.setLiveText(enabled: enabled))
        try await spies.callTextSetEnabled.call()
    }

    func stop() async throws {

        spies.log.append(.stopCallText)
        try await spies.callTextStop.call()
    }
}

private struct TranscriptSpy: SessionTranscript {

    let spies: Spies

    func open(in folder: SessionCallFolder) async throws {

        spies.log.append(.openTranscript(in: folder))
        try await spies.transcriptOpen.call()
    }

    func close() async throws {

        spies.log.append(.closeTranscript)
        try await spies.transcriptClose.call()
    }
}

/// Holds each call until the test completes it; completing waits for the call.
private actor Spy<Value: Sendable, Failure: Error> {

    private var pending: [CheckedContinuation<Result<Value, Failure>, Never>] = []
    private var completers: [CheckedContinuation<Void, Never>] = []

    func call() async throws(Failure) -> Value {

        let result = await withCheckedContinuation { continuation in
            pending.append(continuation)
            for completer in completers { completer.resume() }
            completers.removeAll()
        }
        return try result.get()
    }

    func complete(with value: Value) async {

        await finish(.success(value))
    }

    func fail(_ failure: Failure) async {

        await finish(.failure(failure))
    }

    private func finish(_ result: Result<Value, Failure>) async {

        while pending.isEmpty { await withCheckedContinuation { completers.append($0) } }
        pending.removeFirst().resume(returning: result)
    }
}

private extension Spy where Value == Void {

    func complete() async { await complete(with: ()) }
}

private final class Log: Sendable {

    private let storage = Mutex<[Call]>([])
    var values: [Call] { storage.withLock { $0 } }
    func append(_ value: Call) { storage.withLock { $0.append(value) } }
}
