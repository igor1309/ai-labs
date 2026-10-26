// The rig the Session tests run on: a Session wired to fakes that record
// what was asked of them, and connected the way compose connects the pieces.

import Foundation
@testable import Machine
import Session
import Testing

struct TestFailure: Error {}

struct Rig {

    let output: TestOutput
    let microphoneCapture: TestCapture
    let callCapture: TestCapture
    let microphoneTrack: TestTrack
    let callTrack: TestTrack
    let callText: TestCallText
    let transcript: TestTranscript
    let session: Session

    init(
        held: Set<String> = [],
        failing: Set<String> = [],
        selection: SessionProcessSelection = .init(id: "chosen-app"),
        callAudioSelection: SessionCallCaptureSelection? = nil,
        callFolder: SessionCallFolder = .init(id: "made-folder")
    ) {

        output = TestOutput(held: held, failing: failing)
        let folder = TestFolder(output: output, made: callFolder)
        let processes = TestProcesses(output: output, selection: selection)
        let microphoneTrack = TestTrack(name: "microphone", output: output)
        let callTrack = TestTrack(name: "call", output: output)
        let transcript = TestTranscript(output: output)
        self.microphoneTrack = microphoneTrack
        self.callTrack = callTrack
        self.transcript = transcript
        microphoneCapture = TestCapture(name: "microphone", output: output, track: microphoneTrack)
        let callCapture = TestCapture(name: "call", output: output, track: callTrack, audioSelection: callAudioSelection)
        self.callCapture = callCapture
        callText = TestCallText(output: output, transcript: transcript)
        let handler = SessionEffectHandler(
            folder: folder, processes: processes,
            microphoneCapture: microphoneCapture, callCapture: callCapture,
            microphoneTrack: microphoneTrack, callTrack: callTrack,
            callText: callText, transcript: transcript
        )
        session = Session(handler: handler)
    }

    func begin(liveText: Bool) async {

        await callText.observe(session)
        session.send(.begin(liveText: liveText))
    }

    func settleEffects() async {

        await withTaskCancellationHandler {
            await session.machine.waitForEffects()
        } onCancel: {
            Task { await output.releaseAll() }
        }
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

actor TestOutput {

    private var entries: [String] = []
    private var held: Set<String>
    private var failing: Set<String>
    private var waiters: [String: [UInt64: CheckedContinuation<Void, Never>]] = [:]
    private var nextWaiter: UInt64 = 0
    private var selections: [String: SessionCallCaptureSelection] = [:]

    init(held: Set<String>, failing: Set<String>) {

        self.held = held
        self.failing = failing
    }

    func perform(_ label: String) async throws {

        entries.append(label)
        for waiter in (waiters.removeValue(forKey: "recorded \(label)") ?? [:]).values { waiter.resume() }
        if held.contains(label) {
            for waiter in (waiters.removeValue(forKey: "held \(label)") ?? [:]).values { waiter.resume() }
            await wait(for: "released \(label)")
            try Task.checkCancellation()
        }
        if failing.contains(label) { throw TestError(label: label) }
    }

    func values() -> [String] { entries }

    func recordSelection(_ name: String, _ selection: SessionCallCaptureSelection) { selections[name] = selection }
    func selection(for name: String) -> SessionCallCaptureSelection? { selections[name] }

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
                let ready = key.hasPrefix("released ") ? !held.contains(String(label)) : entries.contains(String(label))
                if Task.isCancelled || ready {
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

    func releaseAll() {

        for label in held { release(label) }
    }

    func release(_ label: String) {

        held.remove(label)
        for continuation in (waiters.removeValue(forKey: "released \(label)") ?? [:]).values { continuation.resume() }
    }
}

struct TestError: Error, CustomStringConvertible {

    let label: String
    var description: String { label.contains("close") ? "close failed" : "\(label) failed" }
}

actor TestFolder: SessionFolder {

    let output: TestOutput
    let made: SessionCallFolder
    init(output: TestOutput, made: SessionCallFolder) { self.output = output; self.made = made }
    func create() async throws -> SessionCallFolder {
        try await output.perform("folder.create")
        return made
    }
}

actor TestProcesses: SessionProcesses {

    let output: TestOutput
    let selection: SessionProcessSelection
    init(output: TestOutput, selection: SessionProcessSelection) { self.output = output; self.selection = selection }
    func select() async throws -> SessionProcessSelection {
        try await output.perform("processes.select")
        return selection
    }
}

actor TestCapture: SessionMicrophoneCapture, SessionCallCapture {

    let name: String
    let output: TestOutput
    let track: TestTrack
    let audioSelection: SessionCallCaptureSelection?
    init(name: String, output: TestOutput, track: TestTrack, audioSelection: SessionCallCaptureSelection? = nil) {
        self.name = name; self.output = output; self.track = track; self.audioSelection = audioSelection
    }
    private var started = false
    private var selection: SessionCallCaptureSelection?
    func start(selection: SessionCallCaptureSelection) async throws {
        self.selection = selection
        await output.recordSelection(name, selection)
        try await start()
    }
    func start() async throws {
        try await output.perform("\(name).capture.start")
        started = true
        await sendAudio("\(name)-first")
    }
    func stop() async throws {
        try await output.perform("\(name).capture.stop")
        started = false
    }
    func sendAudio(_ audio: String? = nil) async {
        guard started else { return }
        guard audioSelection == nil || selection == audioSelection else { return }
        await output.performUnchecked("\(name).audio")
        await track.appendAudio(audio ?? "\(name)-audio")
    }
}

actor TestTrack: SessionTrackFile {

    let name: String
    let output: TestOutput
    init(name: String, output: TestOutput) { self.name = name; self.output = output }
    private var audio: [String] = []
    private var opened = false
    private(set) var receivedFolders: [SessionCallFolder] = []
    func open(in folder: SessionCallFolder) async throws {
        receivedFolders.append(folder)
        try await output.perform("\(name).track.open")
        opened = true
    }
    func appendAudio(_ value: String) {
        if opened { audio.append(value) }
    }
    func values() -> [String] { audio }
    func close() async throws {
        opened = false
        try await output.perform("\(name).track.close")
    }
}

actor TestCallText: SessionCallText {

    let output: TestOutput
    let transcript: TestTranscript
    var enabled = false
    private var started = false
    private weak var session: Session?
    private var switchStatus: SessionState.LiveText = .on
    func setSwitchStatus(_ status: SessionState.LiveText) { switchStatus = status }
    func observe(_ session: Session) { self.session = session }
    func report(_ status: SessionState.LiveText) { session?.send(.callTextStatusChanged(status)) }
    init(output: TestOutput, transcript: TestTranscript) { self.output = output; self.transcript = transcript }
    func start(enabled: Bool) async throws {
        try await output.perform("callText.start(\(enabled ? "on" : "off"))")
        self.enabled = enabled
        started = true
        report(enabled ? .gettingReady : .off)
        await output.performUnchecked("call.text")
        if enabled { await transcript.appendText("callText-first") }
    }
    func setEnabled(_ enabled: Bool) async throws {
        try await output.perform("callText.set(\(enabled ? "on" : "off"))")
        self.enabled = enabled
        report(enabled ? switchStatus : .off)
    }
    func stop() async throws {
        try await output.perform("callText.stop")
        await output.performUnchecked("callText.finalText")
        await transcript.appendText("finishing text")
        started = false
    }
    func speak(_ text: String) async {
        if started && enabled {
            await output.performUnchecked("callText.text(\(text))")
            await transcript.appendText(text)
        }
    }
}

actor TestTranscript: SessionTranscript {

    let output: TestOutput
    private var text: [String] = []
    private var opened = false
    private(set) var receivedFolders: [SessionCallFolder] = []
    init(output: TestOutput) { self.output = output }
    func open(in folder: SessionCallFolder) async throws {
        receivedFolders.append(folder)
        try await output.perform("transcript.open")
        opened = true
    }
    func appendText(_ value: String) {
        if opened { text.append(value) }
    }
    func values() -> [String] { text }
    func close() async throws {
        opened = false
        try await output.perform("transcript.close")
    }
}

extension TestOutput {

    func performUnchecked(_ label: String) {

        entries.append(label)
    }
}
