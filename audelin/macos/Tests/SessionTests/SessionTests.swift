import Machine
import Session
import Testing

@Suite(.timeLimit(.minutes(1)))
struct SessionTests {

    @Test func reducerOrdersBringUpAndBringDown() {

        var state = SessionState()
        var effect: SessionEffect? = nil
        let steps: [(SessionEvent, SessionEffect?, SessionState)] = [
            (.begin(liveText: true), .createFolder, SessionState(phase: .bringingUp, liveText: .gettingReady, folder: .starting)),
            (.folderFinished(error: nil), .selectProcesses, SessionState(phase: .bringingUp, liveText: .gettingReady, folder: .up, processes: .starting)),
            (.processesFinished(selection: .only([4, 7]), error: nil), .openTrack(.microphone), SessionState(phase: .bringingUp, liveText: .gettingReady, folder: .up, processes: .up, microphoneTrack: .starting, processSelection: .only([4, 7]))),
            (.trackFinished(.microphone, error: nil), .openTrack(.call), SessionState(phase: .bringingUp, liveText: .gettingReady, folder: .up, processes: .up, microphoneTrack: .up, callTrack: .starting, processSelection: .only([4, 7]))),
            (.trackFinished(.call, error: nil), .openTranscript, SessionState(phase: .bringingUp, liveText: .gettingReady, folder: .up, processes: .up, microphoneTrack: .up, callTrack: .up, transcript: .starting, processSelection: .only([4, 7]))),
            (.transcriptFinished(error: nil), .startCallText(enabled: true), SessionState(phase: .bringingUp, liveText: .gettingReady, folder: .up, processes: .up, microphoneTrack: .up, callTrack: .up, transcript: .up, callText: .starting, processSelection: .only([4, 7]))),
            (.callTextFinished(error: nil), .startCapture(.microphone, selection: .only([4, 7])), SessionState(phase: .bringingUp, liveText: .gettingReady, folder: .up, processes: .up, microphoneTrack: .up, callTrack: .up, microphoneCapture: .starting, transcript: .up, callText: .up, processSelection: .only([4, 7]))),
            (.captureFinished(.microphone, error: nil), .startCapture(.call, selection: .only([4, 7])), SessionState(phase: .bringingUp, liveText: .gettingReady, folder: .up, processes: .up, microphoneTrack: .up, callTrack: .up, microphoneCapture: .up, callCapture: .starting, transcript: .up, callText: .up, processSelection: .only([4, 7]))),
        ]

        for (event, expected, expectedState) in steps {
            (state, effect) = SessionReducer.reduce(state, event)
            #expect(effect == expected)
            #expect(state == expectedState)
        }
        (state, effect) = SessionReducer.reduce(state, .captureFinished(.call, error: nil))
        #expect(state.phase == .recording)
        #expect(effect == nil)

        let (ending, repeatedEffect) = SessionReducer.reduce(state, .end)
        #expect(ending.phase == .ending)
        #expect(repeatedEffect == .stopCapture(.microphone))
        let (stillEnding, noDuplicate) = SessionReducer.reduce(ending, .end)
        #expect(stillEnding == ending)
        #expect(noDuplicate == nil)

        (state, effect) = (ending, repeatedEffect)
        #expect(effect == .stopCapture(.microphone))
        (state, effect) = SessionReducer.reduce(state, .captureStopped(.microphone, error: nil))
        #expect(effect == .stopCapture(.call))
        (state, effect) = SessionReducer.reduce(state, .captureStopped(.call, error: nil))
        #expect(effect == .closeTrack(.microphone))
        (state, effect) = SessionReducer.reduce(state, .trackClosed(.microphone, error: nil))
        #expect(effect == .closeTrack(.call))
        (state, effect) = SessionReducer.reduce(state, .trackClosed(.call, error: nil))
        #expect(effect == .stopCallText)
        (state, effect) = SessionReducer.reduce(state, .callTextStopped(error: nil))
        #expect(effect == .closeTranscript)
        (state, effect) = SessionReducer.reduce(state, .transcriptClosed(error: nil))
        #expect(state.phase == .ended)
        #expect(effect == nil)
    }

    @Test func bothSidesComeUpInDestinationOrder() async throws {

        let rig = Rig()
        let states = await rig.session.states()
        var updates = states.makeAsyncIterator()
        _ = await updates.next()
        rig.session.send(.begin(liveText: true))
        let recording = try await nextState(&updates) { $0.phase == .recording }
        #expect(recording.microphoneCapture == .up)
        #expect(recording.callCapture == .up)
        #expect(await rig.output.values() == [
            "folder.create", "processes.select", "microphone.track.open", "call.track.open",
            "transcript.open", "callText.start(on)", "call.text", "microphone.capture.start",
            "microphone.audio", "call.capture.start", "call.audio"
        ])
        #expect(await rig.output.selection(for: "microphone") == .only([4, 7]))
        #expect(await rig.output.selection(for: "call") == .only([4, 7]))
        #expect(await rig.microphoneTrack.values() == ["microphone-first"])
        #expect(await rig.callTrack.values() == ["call-first"])
        #expect(await rig.transcript.values() == ["callText-first"])
        await end(rig)
    }

    @Test func endingKeepsAllOutputAndStopsSourcesFirst() async throws {

        let rig = Rig()
        let states = await rig.session.states()
        var updates = states.makeAsyncIterator()
        _ = await updates.next()
        rig.session.send(.begin(liveText: true))
        _ = try await nextState(&updates) { $0.phase == .recording }
        await rig.callText.speak("finishing text")
        rig.session.send(.end)
        _ = try await nextState(&updates) { $0.phase == .ended }
        let output = await rig.output.values()
        #expect(output.contains("callText.text(finishing text)"))
        #expect(output.firstIndex(of: "microphone.capture.stop")! < output.firstIndex(of: "microphone.track.close")!)
        #expect(output.firstIndex(of: "call.capture.stop")! < output.firstIndex(of: "call.track.close")!)
        #expect(output.last == "transcript.close")
        #expect(await rig.microphoneTrack.values() == ["microphone-first"])
        #expect(await rig.callTrack.values() == ["call-first"])
        #expect(await rig.transcript.values() == ["callText-first", "finishing text", "finishing text"])
        #expect(output.contains("callText.stop"))
        await rig.session.end()
    }

    @Test(arguments: [
        "folder.create", "processes.select", "microphone.track.open", "call.track.open",
        "transcript.open", "callText.start(on)", "microphone.capture.start", "call.capture.start"
    ])
    func endingDuringBringUpDoesNotStartLaterPieces(_ held: String) async throws {

        let rig = Rig(held: [held])
        let states = await rig.session.states()
        var updates = states.makeAsyncIterator()
        _ = await updates.next()
        rig.session.send(.begin(liveText: true))
        await rig.output.waitUntilHeld(held)
        rig.session.send(.end)
        await rig.output.release(held)
        _ = try await nextState(&updates) { $0.phase == .ended }
        let output = await rig.output.values()
        let bringUp = [
            "folder.create", "processes.select", "microphone.track.open", "call.track.open",
            "transcript.open", "callText.start(on)", "microphone.capture.start", "call.capture.start"
        ]
        let actualBringUp = output.filter { bringUp.contains($0) }
        let heldIndex = bringUp.firstIndex(of: held)!
        #expect(actualBringUp == Array(bringUp.prefix(heldIndex + 1)))
        #expect(!actualBringUp.contains { bringUp.firstIndex(of: $0)! > heldIndex })
        await rig.session.end()
    }

    @Test func aCaptureThatComesUpAfterEndIsStoppedBeforeEnded() async throws {

        let held = "microphone.capture.start"
        let rig = Rig(held: [held])
        let states = await rig.session.states()
        var updates = states.makeAsyncIterator()
        _ = await updates.next()
        rig.session.send(.begin(liveText: true))
        await rig.output.waitUntilHeld(held)
        rig.session.send(.end)
        await rig.output.release(held)
        let ending = try await nextState(&updates) { $0.phase == .ending && $0.microphoneCapture == .stopping }
        #expect(ending.microphoneCapture == .stopping)
        _ = try await nextState(&updates) { $0.phase == .ended }
        await rig.session.end()
    }

    @Test func folderFailureSaysCannotRecordAndWaitsForEnd() async throws {

        let rig = Rig(failing: ["folder.create"])
        rig.session.send(.begin(liveText: true))
        let state = await rig.waitFor { $0.cannotRecord != nil }
        #expect(state.cannotRecord == "folder: folder.create failed")
        #expect(state.phase == .bringingUp)
        #expect(await rig.output.values() == ["folder.create"])
        await end(rig)
    }

    @Test func folderFailureAlreadyInFlightStillSettlesAfterEnd() async throws {

        let rig = Rig(held: ["folder.create"], failing: ["folder.create"])
        let states = await rig.session.states()
        var updates = states.makeAsyncIterator()
        _ = await updates.next()
        rig.session.send(.begin(liveText: true))
        await rig.output.waitUntilHeld("folder.create")
        rig.session.send(.end)
        await rig.output.release("folder.create")
        let state = try await nextState(&updates) { $0.phase == .ended }
        #expect(state.cannotRecord != nil)
        await rig.session.end()
    }

    @Test func bothCaptureFailuresSayCannotRecord() async throws {

        let rig = Rig(failing: ["microphone.capture.start", "call.capture.start"])
        rig.session.send(.begin(liveText: true))
        let state = await rig.waitFor { $0.cannotRecord != nil }
        #expect(state.cannotRecord == "no track can record")
        #expect(state.phase == .bringingUp)
        await end(rig)
    }

    @Test func bothTrackFailuresSayCannotRecord() async throws {

        let rig = Rig(failing: ["microphone.track.open", "call.track.open"])
        rig.session.send(.begin(liveText: true))
        let state = await rig.waitFor { $0.cannotRecord != nil }
        #expect(state.cannotRecord == "no track can record")
        await end(rig)
    }

    @Test func otherFailureIsNamedAndTheOtherSideRecords() async throws {

        let rig = Rig(failing: ["call.track.open"])
        rig.session.send(.begin(liveText: true))
        let state = await rig.waitFor { $0.phase == .recording }
        #expect(state.failures.contains { $0.piece == "call track" })
        #expect(state.microphoneCapture == .up)
        await rig.microphoneCapture.sendAudio()
        #expect(await rig.output.values().contains("microphone.audio"))
        await end(rig)
    }

    @Test(arguments: [
        "processes.select", "microphone.track.open", "call.track.open", "transcript.open",
        "callText.start(on)", "microphone.capture.start", "call.capture.start"
    ])
    func eachOtherBringUpFailureKeepsAnotherTrack(_ failing: String) async throws {

        let rig = Rig(failing: [failing])
        rig.session.send(.begin(liveText: true))
        let state = await rig.waitFor { $0.phase == .recording }
        #expect(!state.failures.isEmpty)
        #expect(state.microphoneTrack.isUp || state.callTrack.isUp)
        await end(rig)
    }

    @Test func lostAccessIsNamedWhileTheOtherSideRecords() async throws {

        let rig = Rig()
        rig.session.send(.begin(liveText: true))
        _ = await rig.waitFor { $0.phase == .recording }
        rig.events.send(.accessChanged(.microphone, available: false))
        let state = await rig.waitFor { $0.failures.contains { $0.piece == "microphone access" } }
        #expect(state.callCapture == .up)
        await end(rig)
    }

    @Test func runtimeFailureKeepsOtherSideAndNamesThePiece() async throws {

        let rig = Rig()
        rig.session.send(.begin(liveText: true))
        _ = await rig.waitFor { $0.phase == .recording }
        await rig.microphoneCapture.sendAudio("before-failure")
        rig.events.send(.pieceFailed(.capture(.microphone), error: "device stopped"))
        let state = await rig.waitFor { $0.failures.contains { $0.piece == "microphone capture" } }
        #expect(state.microphoneCapture == .failed("device stopped"))
        #expect(state.callCapture == .up)
        #expect(state.phase == .recording)
        #expect(await rig.microphoneTrack.values() == ["microphone-first", "before-failure"])
        await end(rig)
    }

    @Test func runtimeTrackFailureAndAccessLossSaysCannotRecord() async throws {

        let rig = Rig()
        rig.session.send(.begin(liveText: true))
        _ = await rig.waitFor { $0.phase == .recording }
        rig.events.send(.pieceFailed(.track(.call), error: "disk stopped"))
        rig.events.send(.accessChanged(.microphone, available: false))
        let state = await rig.waitFor { $0.cannotRecord != nil }
        #expect(state.cannotRecord == "no track can record")
        #expect(state.callTrack == .failed("disk stopped"))
        #expect(state.microphoneCapture == .failed("access lost"))
        await end(rig)
    }

    @Test func bothRuntimeCaptureFailuresSayCannotRecord() async throws {

        let rig = Rig()
        rig.session.send(.begin(liveText: true))
        _ = await rig.waitFor { $0.phase == .recording }
        rig.events.send(.pieceFailed(.capture(.microphone), error: "microphone stopped"))
        rig.events.send(.pieceFailed(.capture(.call), error: "call stopped"))
        let state = await rig.waitFor { $0.cannotRecord != nil }
        #expect(state.cannotRecord == "no track can record")
        #expect(state.microphoneCapture == .failed("microphone stopped"))
        #expect(state.callCapture == .failed("call stopped"))
        await end(rig)
    }

    @Test(arguments: [
        SessionState.Piece.track(.call),
        SessionState.Piece.capture(.call),
        SessionState.Piece.callText,
        SessionState.Piece.transcript
    ])
    func everyRuntimePieceFailureIsNamed(_ piece: SessionState.Piece) {

        let recording = SessionState(
            phase: .recording,
            microphoneTrack: .up,
            callTrack: .up,
            microphoneCapture: .up,
            callCapture: .up,
            transcript: .up,
            callText: .up
        )
        let (state, effect) = SessionReducer.reduce(recording, .pieceFailed(piece, error: "stopped"))
        #expect(effect == nil)
        #expect(state.failures.count == 1)
        switch piece {
        case .track(.call): #expect(state.callTrack == .failed("stopped"))
        case .capture(.call): #expect(state.callCapture == .failed("stopped"))
        case .callText: #expect(state.callText == .failed("stopped"))
        case .transcript: #expect(state.transcript == .failed("stopped"))
        default: #expect(Bool(false))
        }
        #expect(state.phase == .recording)
        #expect(state.microphoneTrack == .up)
    }

    @Test func accessLossWinsOverLateCaptureStart() {

        var state = SessionState(
            phase: .bringingUp,
            microphoneTrack: .up,
            callTrack: .up,
            microphoneCapture: .starting,
            callCapture: .starting
        )
        (state, _) = SessionReducer.reduce(state, .accessChanged(.microphone, available: false))
        (state, _) = SessionReducer.reduce(state, .captureFinished(.microphone, error: nil))
        #expect(state.microphoneCapture == .failed("access lost"))
        #expect(state.failures.contains { $0.piece == "microphone access" })
    }

    @Test func allExceptProcessSelectionReachesBothCaptures() async throws {

        let rig = Rig(selection: .allExcept([11]))
        rig.session.send(.begin(liveText: false))
        _ = await rig.waitFor { $0.phase == .recording }
        #expect(await rig.output.selection(for: "microphone") == .allExcept([11]))
        #expect(await rig.output.selection(for: "call") == .allExcept([11]))
        await end(rig)
    }

    @Test func liveTextIsGettingReadyWhenRecordingStarts() async throws {

        let rig = Rig()
        rig.session.send(.begin(liveText: true))
        let state = await rig.waitFor { $0.phase == .recording }
        #expect(state.liveText == .gettingReady)
        await end(rig)
    }

    @Test func liveTextSwitchesOffAndStopsNewText() async throws {

        let rig = Rig()
        rig.session.send(.begin(liveText: true))
        _ = await rig.waitFor { $0.phase == .recording }
        await rig.callText.speak("before")
        rig.session.send(.liveTextChanged(false))
        let state = await rig.waitFor { $0.liveText == .off }
        #expect(state.microphoneCapture == .up)
        await rig.output.waitUntilRecorded("callText.set(off)")
        await rig.callText.speak("after")
        #expect(await rig.output.values().contains("callText.text(before)"))
        #expect(!(await rig.output.values()).contains("callText.text(after)"))
        #expect(await rig.transcript.values() == ["callText-first", "before"])
        #expect(await rig.microphoneTrack.values() == ["microphone-first"])
        #expect(await rig.callTrack.values() == ["call-first"])
        await end(rig)
    }

    @Test func liveTextSwitchesOnAndAcceptsNewText() async throws {

        let rig = Rig()
        rig.session.send(.begin(liveText: false))
        _ = await rig.waitFor { $0.phase == .recording }
        rig.session.send(.liveTextChanged(true))
        _ = await rig.waitFor { $0.liveText == .on }
        await rig.output.waitUntilRecorded("callText.set(on)")
        await rig.callText.speak("new")
        #expect(await rig.output.values().contains("callText.text(new)"))
        #expect(await rig.transcript.values() == ["new"])
        #expect(await rig.microphoneTrack.values() == ["microphone-first"])
        #expect(await rig.callTrack.values() == ["call-first"])
        await end(rig)
    }

    @Test func preferenceEventsChangeTheRunningSession() async throws {

        let rig = Rig()
        rig.session.send(.begin(liveText: true))
        _ = await rig.waitFor { $0.phase == .recording }
        rig.session.send(.preferenceChanged(false))
        #expect((await rig.waitFor { $0.liveText == .off }).liveText == .off)
        rig.session.send(.preferenceChanged(true))
        #expect((await rig.waitFor { $0.liveText == .on }).liveText == .on)
        await rig.callText.speak("kept")
        #expect(await rig.transcript.values().contains("kept"))
        #expect(await rig.microphoneTrack.values() == ["microphone-first"])
        #expect(await rig.callTrack.values() == ["call-first"])
        await end(rig)
    }

    @Test func preferenceAtStartControlsLiveText() async throws {

        let rig = Rig()
        rig.session.send(.begin(liveText: false))
        let state = await rig.waitFor { $0.phase == .recording }
        #expect(state.liveText == .off)
        await rig.callText.speak("ignored")
        #expect(!(await rig.output.values()).contains("callText.text(ignored)"))
        #expect(await rig.transcript.values().isEmpty)
        #expect(await rig.microphoneTrack.values() == ["microphone-first"])
        #expect(await rig.callTrack.values() == ["call-first"])
        await end(rig)
    }

    @Test(arguments: ["microphone.track.close", "call.track.close", "transcript.close"])
    func closeFailureIsNamedAndEndingContinues(_ failing: String) async throws {

        let rig = Rig(failing: [failing])
        rig.session.send(.begin(liveText: true))
        _ = await rig.waitFor { $0.phase == .recording }
        rig.session.send(.end)
        let state = await rig.waitFor { $0.phase == .ended }
        #expect(state.failures.contains { $0.message == "close failed" })
        #expect(await rig.microphoneTrack.values() == ["microphone-first"])
        #expect(await rig.callTrack.values() == ["call-first"])
        #expect(await rig.transcript.values() == ["callText-first", "finishing text"])
        await rig.session.end()
    }
}

private func nextState(
    _ iterator: inout AsyncStream<SessionState>.AsyncIterator,
    matching: (SessionState) -> Bool
) async throws -> SessionState {

    while let state = await iterator.next() {
        if matching(state) { return state }
    }
    throw TestFailure()
}

private func end(_ rig: Rig) async {

    rig.session.send(.end)
    _ = await rig.waitFor { $0.phase == .ended }
    await rig.session.end()
}

private struct TestFailure: Error {}

private struct Rig {

    let output: TestOutput
    let microphoneCapture: TestCapture
    let microphoneTrack: TestTrack
    let callTrack: TestTrack
    let callText: TestCallText
    let transcript: TestTranscript
    let events: TestEvents
    let session: Session

    init(held: Set<String> = [], failing: Set<String> = [], selection: SessionProcessSelection = .only([4, 7])) {

        output = TestOutput(held: held, failing: failing)
        let folder = TestFolder(output: output)
        let processes = TestProcesses(output: output, selection: selection)
        let microphoneTrack = TestTrack(name: "microphone", output: output)
        let callTrack = TestTrack(name: "call", output: output)
        let transcript = TestTranscript(output: output)
        self.microphoneTrack = microphoneTrack
        self.callTrack = callTrack
        self.transcript = transcript
        microphoneCapture = TestCapture(name: "microphone", output: output, track: microphoneTrack)
        let callCapture = TestCapture(name: "call", output: output, track: callTrack)
        callText = TestCallText(output: output, transcript: transcript)
        events = TestEvents()
        let handler = SessionEffectHandler(
            folder: folder, processes: processes,
            microphoneCapture: microphoneCapture, callCapture: callCapture,
            microphoneTrack: microphoneTrack, callTrack: callTrack,
            callText: callText, transcript: transcript
        )
        session = Session(handler: handler, events: events)
    }

    func waitFor(_ matching: @escaping (SessionState) -> Bool) async -> SessionState {

        let stream = await session.states()
        var iterator = stream.makeAsyncIterator()
        while let state = await iterator.next() {
            if matching(state) { return state }
        }
        return await session.snapshot()
    }
}

private final class TestEvents: SessionEventSource, @unchecked Sendable {

    let events: AsyncStream<SessionEvent>
    private let continuation: AsyncStream<SessionEvent>.Continuation

    init() {
        (events, continuation) = AsyncStream.makeStream()
    }

    func send(_ event: SessionEvent) {
        continuation.yield(event)
    }
}

private actor TestOutput {

    private var entries: [String] = []
    private var held: Set<String>
    private var failing: Set<String>
    private var waiters: [String: [UInt64: CheckedContinuation<Void, Never>]] = [:]
    private var blocked: [String: [CheckedContinuation<Void, Never>]] = [:]
    private var nextWaiter: UInt64 = 0
    private var selections: [String: SessionProcessSelection] = [:]

    init(held: Set<String>, failing: Set<String>) {

        self.held = held
        self.failing = failing
    }

    func perform(_ label: String) async throws {

        entries.append(label)
        for waiter in (waiters.removeValue(forKey: "recorded \(label)") ?? [:]).values { waiter.resume() }
        if held.contains(label) {
            for waiter in (waiters.removeValue(forKey: "held \(label)") ?? [:]).values { waiter.resume() }
            await withCheckedContinuation { continuation in blocked[label, default: []].append(continuation) }
        }
        if failing.contains(label) { throw TestError(label: label) }
    }

    func values() -> [String] { entries }

    func recordSelection(_ name: String, _ selection: SessionProcessSelection) { selections[name] = selection }
    func selection(for name: String) -> SessionProcessSelection? { selections[name] }

    func waitUntilHeld(_ label: String) async {

        if entries.contains(label) { return }
        await wait(for: "held \(label)")
    }

    func waitUntilRecorded(_ label: String) async {

        if entries.contains(label) { return }
        await wait(for: "recorded \(label)")
    }

    // A wait gives up when its test is cancelled, so a time limit can end it.
    private func wait(for key: String) async {

        nextWaiter += 1
        let waiter = nextWaiter
        await withTaskCancellationHandler {
            await withCheckedContinuation { continuation in
                let label = key.drop { $0 != " " }.dropFirst()
                if Task.isCancelled || entries.contains(String(label)) {
                    continuation.resume()
                } else {
                    waiters[key, default: [:]][waiter] = continuation
                }
            }
        } onCancel: {
            Task { await self.stopWaiting(waiter, for: key) }
        }
    }

    private func stopWaiting(_ waiter: UInt64, for key: String) {

        waiters[key]?.removeValue(forKey: waiter)?.resume()
    }

    func release(_ label: String) {

        for continuation in blocked.removeValue(forKey: label) ?? [] { continuation.resume() }
    }
}

private struct TestError: Error, CustomStringConvertible {

    let label: String
    var description: String { label.contains("close") ? "close failed" : "\(label) failed" }
}

private actor TestFolder: SessionFolder {

    let output: TestOutput
    init(output: TestOutput) { self.output = output }
    func create() async throws { try await output.perform("folder.create") }
}

private actor TestProcesses: SessionProcesses {

    let output: TestOutput
    let selection: SessionProcessSelection
    init(output: TestOutput, selection: SessionProcessSelection) { self.output = output; self.selection = selection }
    func select() async throws -> SessionProcessSelection {
        try await output.perform("processes.select")
        return selection
    }
}

private actor TestCapture: SessionCapture {

    let name: String
    let output: TestOutput
    let track: TestTrack
    init(name: String, output: TestOutput, track: TestTrack) { self.name = name; self.output = output; self.track = track }
    func start(selection: SessionProcessSelection) async throws {
        await output.recordSelection(name, selection)
        try await output.perform("\(name).capture.start")
        await output.performUnchecked("\(name).audio")
        await track.appendAudio("\(name)-first")
    }
    func stop() async throws { try await output.perform("\(name).capture.stop") }
    func sendAudio(_ audio: String? = nil) async {
        await output.performUnchecked("\(name).audio")
        await track.appendAudio(audio ?? "\(name)-audio")
    }
}

private actor TestTrack: SessionTrackFile {

    let name: String
    let output: TestOutput
    init(name: String, output: TestOutput) { self.name = name; self.output = output }
    private var audio: [String] = []
    func open() async throws { try await output.perform("\(name).track.open") }
    func appendAudio(_ value: String) { audio.append(value) }
    func values() -> [String] { audio }
    func close() async throws { try await output.perform("\(name).track.close") }
}

private actor TestCallText: SessionCallText {

    let output: TestOutput
    let transcript: TestTranscript
    var enabled = false
    init(output: TestOutput, transcript: TestTranscript) { self.output = output; self.transcript = transcript }
    func start(enabled: Bool) async throws {
        self.enabled = enabled
        try await output.perform("callText.start(\(enabled ? "on" : "off"))")
        await output.performUnchecked("call.text")
        if enabled { await transcript.appendText("callText-first") }
    }
    func setEnabled(_ enabled: Bool) async throws {
        self.enabled = enabled
        try await output.perform("callText.set(\(enabled ? "on" : "off"))")
    }
    func stop() async throws {
        try await output.perform("callText.stop")
        await output.performUnchecked("callText.finalText")
        await transcript.appendText("finishing text")
    }
    func speak(_ text: String) async {
        if enabled {
            await output.performUnchecked("callText.text(\(text))")
            await transcript.appendText(text)
        }
    }
}

private actor TestTranscript: SessionTranscript {

    let output: TestOutput
    private var text: [String] = []
    init(output: TestOutput) { self.output = output }
    func open() async throws { try await output.perform("transcript.open") }
    func appendText(_ value: String) { text.append(value) }
    func values() -> [String] { text }
    func close() async throws { try await output.perform("transcript.close") }
}

private extension TestOutput {

    func performUnchecked(_ label: String) {

        entries.append(label)
    }
}
