import Machine
import Session
import Testing

@Suite(.timeLimit(.minutes(1)))
struct SessionTests {

    @Test func reducerOrdersBringUpAndBringDown() {

        var state = SessionState()
        var effect: SessionEffect? = nil
        let steps: [(SessionEvent, SessionEffect?)] = [
            (.begin(liveText: true), .createFolder),
            (.folderFinished(error: nil), .selectProcesses),
            (.processesFinished(selection: .init(processIDs: [4, 7]), error: nil), .openTrack(.microphone)),
            (.trackFinished(.microphone, error: nil), .openTrack(.call)),
            (.trackFinished(.call, error: nil), .openTranscript),
            (.transcriptFinished(error: nil), .startCallText(enabled: true)),
            (.callTextFinished(error: nil), .startCapture(.microphone, selection: .init(processIDs: [4, 7]))),
            (.captureFinished(.microphone, error: nil), .startCapture(.call, selection: .init(processIDs: [4, 7]))),
        ]

        for (event, expected) in steps {
            (state, effect) = SessionReducer.reduce(state, event)
            #expect(effect == expected)
        }
        (state, effect) = SessionReducer.reduce(state, .captureFinished(.call, error: nil))
        #expect(state.phase == .recording)
        #expect(effect == nil)

        (state, effect) = SessionReducer.reduce(state, .end)
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
        let states = await rig.machine.states()
        var updates = states.makeAsyncIterator()
        _ = await updates.next()
        rig.machine.send(.begin(liveText: true))
        let recording = try await nextState(&updates) { $0.phase == .recording }
        #expect(recording.microphoneCapture == .up)
        #expect(recording.callCapture == .up)
        #expect(await rig.output.values() == [
            "folder.create", "processes.select", "microphone.track.open", "call.track.open",
            "transcript.open", "callText.start(on)", "call.text", "microphone.capture.start",
            "microphone.audio", "call.capture.start", "call.audio"
        ])
        await end(rig)
    }

    @Test func endingKeepsAllOutputAndStopsSourcesFirst() async throws {

        let rig = Rig()
        let states = await rig.machine.states()
        var updates = states.makeAsyncIterator()
        _ = await updates.next()
        rig.machine.send(.begin(liveText: true))
        _ = try await nextState(&updates) { $0.phase == .recording }
        await rig.callText.speak("finishing text")
        rig.machine.send(.end)
        _ = try await nextState(&updates) { $0.phase == .ended }
        let output = await rig.output.values()
        #expect(output.contains("callText.text(finishing text)"))
        #expect(output.firstIndex(of: "microphone.capture.stop")! < output.firstIndex(of: "microphone.track.close")!)
        #expect(output.firstIndex(of: "call.capture.stop")! < output.firstIndex(of: "call.track.close")!)
        #expect(output.last == "transcript.close")
        await rig.machine.end()
    }

    @Test(arguments: [
        "folder.create", "processes.select", "microphone.track.open", "call.track.open",
        "transcript.open", "callText.start(on)", "microphone.capture.start", "call.capture.start"
    ])
    func endingDuringBringUpDoesNotStartLaterPieces(_ held: String) async throws {

        let rig = Rig(held: [held])
        let states = await rig.machine.states()
        var updates = states.makeAsyncIterator()
        _ = await updates.next()
        rig.machine.send(.begin(liveText: true))
        await rig.output.waitUntilHeld(held)
        rig.machine.send(.end)
        await rig.output.release(held)
        _ = try await nextState(&updates) { $0.phase == .ended }
        let output = await rig.output.values()
        #expect(output.filter { $0.hasSuffix(".start") || $0.hasSuffix(".open") }.count <= 6)
        await rig.machine.end()
    }

    @Test func aCaptureThatComesUpAfterEndIsStoppedBeforeEnded() async throws {

        let held = "microphone.capture.start"
        let rig = Rig(held: [held])
        let states = await rig.machine.states()
        var updates = states.makeAsyncIterator()
        _ = await updates.next()
        rig.machine.send(.begin(liveText: true))
        await rig.output.waitUntilHeld(held)
        rig.machine.send(.end)
        await rig.output.release(held)
        let ending = try await nextState(&updates) { $0.phase == .ending && $0.microphoneCapture == .stopping }
        #expect(ending.microphoneCapture == .stopping)
        _ = try await nextState(&updates) { $0.phase == .ended }
        await rig.machine.end()
    }

    @Test func folderFailureSaysCannotRecordAndWaitsForEnd() async throws {

        let rig = Rig(failing: ["folder.create"])
        rig.machine.send(.begin(liveText: true))
        let state = await rig.waitFor { $0.cannotRecord != nil }
        #expect(state.cannotRecord == "folder: folder.create failed")
        #expect(state.phase == .bringingUp)
        #expect(await rig.output.values() == ["folder.create"])
        await end(rig)
    }

    @Test func folderFailureAlreadyInFlightStillSettlesAfterEnd() async throws {

        let rig = Rig(held: ["folder.create"], failing: ["folder.create"])
        let states = await rig.machine.states()
        var updates = states.makeAsyncIterator()
        _ = await updates.next()
        rig.machine.send(.begin(liveText: true))
        await rig.output.waitUntilHeld("folder.create")
        rig.machine.send(.end)
        await rig.output.release("folder.create")
        let state = try await nextState(&updates) { $0.phase == .ended }
        #expect(state.cannotRecord != nil)
        await rig.machine.end()
    }

    @Test func bothCaptureFailuresSayCannotRecord() async throws {

        let rig = Rig(failing: ["microphone.capture.start", "call.capture.start"])
        rig.machine.send(.begin(liveText: true))
        let state = await rig.waitFor { $0.cannotRecord != nil }
        #expect(state.cannotRecord == "no track can record")
        #expect(state.phase == .bringingUp)
        await end(rig)
    }

    @Test func bothTrackFailuresSayCannotRecord() async throws {

        let rig = Rig(failing: ["microphone.track.open", "call.track.open"])
        rig.machine.send(.begin(liveText: true))
        let state = await rig.waitFor { $0.cannotRecord != nil }
        #expect(state.cannotRecord == "no track can record")
        await end(rig)
    }

    @Test func otherFailureIsNamedAndTheOtherSideRecords() async throws {

        let rig = Rig(failing: ["call.track.open"])
        rig.machine.send(.begin(liveText: true))
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
        rig.machine.send(.begin(liveText: true))
        let state = await rig.waitFor { $0.phase == .recording }
        #expect(!state.failures.isEmpty)
        #expect(state.microphoneTrack.isUp || state.callTrack.isUp)
        await end(rig)
    }

    @Test func lostAccessIsNamedWhileTheOtherSideRecords() async throws {

        let rig = Rig()
        rig.machine.send(.begin(liveText: true))
        _ = await rig.waitFor { $0.phase == .recording }
        rig.machine.send(.accessChanged(.microphone, available: false))
        let state = await rig.waitFor { $0.failures.contains { $0.piece == "microphone access" } }
        #expect(state.callCapture == .up)
        await end(rig)
    }

    @Test func liveTextIsGettingReadyWhenRecordingStarts() async throws {

        let rig = Rig()
        rig.machine.send(.begin(liveText: true))
        let state = await rig.waitFor { $0.phase == .recording }
        #expect(state.liveText == .gettingReady)
        await end(rig)
    }

    @Test func liveTextSwitchesOffAndStopsNewText() async throws {

        let rig = Rig()
        rig.machine.send(.begin(liveText: true))
        _ = await rig.waitFor { $0.phase == .recording }
        await rig.callText.speak("before")
        rig.machine.send(.liveTextChanged(false))
        let state = await rig.waitFor { $0.liveText == .off }
        #expect(state.microphoneCapture == .up)
        await rig.output.waitUntilRecorded("callText.set(off)")
        await rig.callText.speak("after")
        #expect(await rig.output.values().contains("callText.text(before)"))
        #expect(!(await rig.output.values()).contains("callText.text(after)"))
        await end(rig)
    }

    @Test func liveTextSwitchesOnAndAcceptsNewText() async throws {

        let rig = Rig()
        rig.machine.send(.begin(liveText: false))
        _ = await rig.waitFor { $0.phase == .recording }
        rig.machine.send(.liveTextChanged(true))
        _ = await rig.waitFor { $0.liveText == .on }
        await rig.output.waitUntilRecorded("callText.set(on)")
        await rig.callText.speak("new")
        #expect(await rig.output.values().contains("callText.text(new)"))
        await end(rig)
    }

    @Test func preferenceEventsChangeTheRunningSession() async throws {

        let rig = Rig()
        rig.machine.send(.begin(liveText: true))
        _ = await rig.waitFor { $0.phase == .recording }
        rig.machine.send(.preferenceChanged(false))
        #expect((await rig.waitFor { $0.liveText == .off }).liveText == .off)
        rig.machine.send(.preferenceChanged(true))
        #expect((await rig.waitFor { $0.liveText == .on }).liveText == .on)
        await end(rig)
    }

    @Test func preferenceAtStartControlsLiveText() async throws {

        let rig = Rig()
        rig.machine.send(.begin(liveText: false))
        let state = await rig.waitFor { $0.phase == .recording }
        #expect(state.liveText == .off)
        await rig.callText.speak("ignored")
        #expect(!(await rig.output.values()).contains("callText.text(ignored)"))
        await end(rig)
    }

    @Test(arguments: ["microphone.track.close", "call.track.close", "transcript.close"])
    func closeFailureIsNamedAndEndingContinues(_ failing: String) async throws {

        let rig = Rig(failing: [failing])
        rig.machine.send(.begin(liveText: true))
        _ = await rig.waitFor { $0.phase == .recording }
        rig.machine.send(.end)
        let state = await rig.waitFor { $0.phase == .ended }
        #expect(state.failures.contains { $0.message == "close failed" })
        await rig.machine.end()
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

    rig.machine.send(.end)
    _ = await rig.waitFor { $0.phase == .ended }
    await rig.machine.end()
}

private struct TestFailure: Error {}

private struct Rig {

    let output: TestOutput
    let microphoneCapture: TestCapture
    let callText: TestCallText
    let machine: Machine<SessionState, SessionEvent, SessionEffect>

    init(held: Set<String> = [], failing: Set<String> = []) {

        output = TestOutput(held: held, failing: failing)
        let folder = TestFolder(output: output)
        let processes = TestProcesses(output: output)
        microphoneCapture = TestCapture(name: "microphone", output: output)
        let callCapture = TestCapture(name: "call", output: output)
        let microphoneTrack = TestTrack(name: "microphone", output: output)
        let callTrack = TestTrack(name: "call", output: output)
        callText = TestCallText(output: output)
        let transcript = TestTranscript(output: output)
        let handler = SessionEffectHandler(
            folder: folder, processes: processes,
            microphoneCapture: microphoneCapture, callCapture: callCapture,
            microphoneTrack: microphoneTrack, callTrack: callTrack,
            callText: callText, transcript: transcript
        )
        machine = handler.machine()
    }

    func waitFor(_ matching: @escaping (SessionState) -> Bool) async -> SessionState {

        let stream = await machine.states()
        var iterator = stream.makeAsyncIterator()
        while let state = await iterator.next() {
            if matching(state) { return state }
        }
        return await machine.snapshot()
    }
}

private actor TestOutput {

    private var entries: [String] = []
    private var held: Set<String>
    private var failing: Set<String>
    private var waiters: [String: [UInt64: CheckedContinuation<Void, Never>]] = [:]
    private var blocked: [String: [CheckedContinuation<Void, Never>]] = [:]
    private var nextWaiter: UInt64 = 0

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
                if Task.isCancelled {
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
    init(output: TestOutput) { self.output = output }
    func select() async throws -> SessionProcessSelection {
        try await output.perform("processes.select")
        return .init(processIDs: [4, 7])
    }
}

private actor TestCapture: SessionCapture {

    let name: String
    let output: TestOutput
    init(name: String, output: TestOutput) { self.name = name; self.output = output }
    func start(selection: SessionProcessSelection) async throws {
        try await output.perform("\(name).capture.start")
        await output.performUnchecked("\(name).audio")
    }
    func stop() async throws { try await output.perform("\(name).capture.stop") }
    func sendAudio() async { await output.performUnchecked("\(name).audio") }
}

private actor TestTrack: SessionTrackFile {

    let name: String
    let output: TestOutput
    init(name: String, output: TestOutput) { self.name = name; self.output = output }
    func open() async throws { try await output.perform("\(name).track.open") }
    func close() async throws { try await output.perform("\(name).track.close") }
}

private actor TestCallText: SessionCallText {

    let output: TestOutput
    var enabled = false
    init(output: TestOutput) { self.output = output }
    func start(enabled: Bool) async throws {
        self.enabled = enabled
        try await output.perform("callText.start(\(enabled ? "on" : "off"))")
        await output.performUnchecked("call.text")
    }
    func setEnabled(_ enabled: Bool) async throws {
        self.enabled = enabled
        try await output.perform("callText.set(\(enabled ? "on" : "off"))")
    }
    func stop() async throws {
        try await output.perform("callText.stop")
        await output.performUnchecked("callText.finalText")
    }
    func speak(_ text: String) async {
        if enabled { await output.performUnchecked("callText.text(\(text))") }
    }
}

private actor TestTranscript: SessionTranscript {

    let output: TestOutput
    init(output: TestOutput) { self.output = output }
    func open() async throws { try await output.perform("transcript.open") }
    func close() async throws { try await output.perform("transcript.close") }
}

private extension TestOutput {

    func performUnchecked(_ label: String) {

        entries.append(label)
    }
}
