import BlockingTestWork
@testable import Audelin
@testable import CallText
import CallAppProcesses
import CallFolder
import CoreAudioProcesses
import Foundation
import protocol LiveAudio.Capture
import struct LiveAudio.AudioPiece
import struct MicrophoneCapture.AudioPiece
import struct SystemAudioCapture.AudioPiece
import Preferences
import Recording
import Session
import Testing
@testable import Compose

@Suite(.timeLimit(.minutes(1)))
struct LoggingTests {

    @Test func portsPreserveResultsArgumentsAndErrorIdentity() async throws {
        for failure in [nil, LogFailure()] {
            let sink = LogSpy()
            let spy = PortSpy(failure: failure)
            let log = PortLog(sink: sink, name: "port")
            let folder = LoggingFolder(base: spy, log: log)
            let processes = LoggingProcesses(base: spy, log: log)
            let microphone = LoggingMicrophone(base: spy, log: log)
            let call = LoggingCallCapture(base: spy, log: log)
            let track = LoggingTrack(base: spy, log: log)
            let text = LoggingCallText(base: spy, log: log)
            let transcript = LoggingTranscript(base: spy, log: log)
            let destination = SessionCallFolder(id: "/private/calls/name")
            let selection = SessionCallCaptureSelection.chosen(.init(id: "selection"))
            let operations: [() async throws -> Void] = [
                { let result = try await folder.create(); #expect(result == destination) },
                { let result = try await processes.select(); #expect(result == .init(id: "selection")) },
                { try await microphone.start() }, { try await microphone.stop() },
                { try await call.start(selection: selection) }, { try await call.stop() },
                { try await track.open(in: destination) }, { try await track.close() },
                { try await text.start(enabled: true) }, { try await text.setEnabled(false) },
                { try await text.stop() },
                { try await transcript.open(in: destination) }, { try await transcript.close() },
            ]
            for operation in operations {
                do {
                    try await operation()
                    #expect(failure == nil)
                } catch {
                    #expect((error as? LogFailure) === failure)
                }
            }
            #expect(spy.calls.all == ["create", "select", "start", "stop", "chosen(selection)", "stop",
                                     "open(/private/calls/name)", "close", "start(true)", "enabled(false)",
                                     "stop", "open(/private/calls/name)", "close"])
            let entries = sink.entries.all
            #expect(entries.filter { $0.message.hasSuffix("called") }.count == operations.count)
            #expect(entries.filter { $0.message.hasSuffix(failure == nil ? "succeeded" : "failed") }.count == operations.count)
            #expect(entries.compactMap(\.error) == (failure == nil ? [] : Array(repeating: "sentinel failure", count: operations.count)))
            #expect(entries.allSatisfy { !$0.message.contains(destination.id) })
            #expect(entries.contains { $0.path == destination.id })
        }
        try await withComposeFolder { root in
            let sink = LogSpy()
            let rig = LogPieces(root: root, sink: sink)
            defer { rig.finish() }
            let handler = rig.pieces.handler(sink: sink)
            #expect(await handler.handle(.createFolder) == .folderFinished(error: nil, folder: .init(id: root.appendingPathComponent("1970.01.01-0000").path)))
            guard case .processesFinished(_, error: nil) = await handler.handle(.selectProcesses) else {
                Issue.record("composed process selection failed"); return
            }
            let effects: [(SessionEffect, SessionEvent)] = [
                (.openTrack(.microphone), .trackFinished(.microphone, error: nil)),
                (.openTrack(.call), .trackFinished(.call, error: nil)),
                (.openTranscript, .transcriptFinished(error: nil)),
                (.startCallText(enabled: false), .callTextFinished(error: nil)),
                (.startMicrophoneCapture, .captureFinished(.microphone, error: nil)),
                (.startCallCapture(selection: .everyAppButAudelin), .captureFinished(.call, error: nil)),
                (.setLiveText(.init(id: 1, enabled: false)), .liveTextSet(request: .init(id: 1, enabled: false), error: nil)),
                (.stopCapture(.microphone), .captureStopped(.microphone, error: nil)),
                (.stopCapture(.call), .captureStopped(.call, error: nil)),
                (.closeTrack(.microphone), .trackClosed(.microphone, error: nil)),
                (.closeTrack(.call), .trackClosed(.call, error: nil)),
                (.stopCallText, .callTextStopped(error: nil)),
                (.closeTranscript, .transcriptClosed(error: nil)),
            ]
            for (effect, expected) in effects { #expect(await handler.handle(effect) == expected) }
            let operations = ["folder.create", "processes.select", "microphoneTrack.open", "callTrack.open",
                "transcript.open", "callText.start enabled=false", "microphoneCapture.start",
                "callCapture.start selection=everyAppButAudelin", "callText.setEnabled enabled=false",
                "microphoneCapture.stop", "callCapture.stop", "microphoneTrack.close", "callTrack.close",
                "callText.stop", "transcript.close"]
            let entries = sink.entries.all.filter { $0.category == .session }
            #expect(entries.map(\.message) == operations.flatMap {
                $0 == "folder.create" ? ["\($0) called", "\($0) succeeded", "folder created"] : ["\($0) called", "\($0) succeeded"]
            })
            let path = root.appendingPathComponent("1970.01.01-0000").path
            #expect(entries.allSatisfy { !$0.message.contains(root.path) && $0.error == nil })
            #expect(entries.compactMap(\.path) == Array(repeating: path, count: 7))
        }
    }

    @Test(arguments: [["Parakeet v3"], ["Parakeet v3", "Nemotron"]])
    func missingModelRefusesTheRecordingBeforeAnythingIsMade(missing: [String]) async throws {
        try await withComposeFolder { root in
            let sink = LogSpy()
            let rig = LogPieces(root: root, sink: sink, missingModels: missing)
            defer { rig.finish() }
            let handler = rig.pieces.handler(sink: sink)
            let names = missing.joined(separator: ", ")
            var state = SessionState()
            for command in [SessionEvent.begin(liveText: true), .end] {
                var event = command
                while true {
                    let (updated, effect) = SessionReducer.reduce(state, event)
                    state = updated
                    guard let effect else { break }
                    event = await handler.handle(effect)
                }
                #expect(state.cannotRecord == "model: \(names) not on disk")
            }
            #expect(state.phase == .ended)
            #expect(sink.entries.all.filter { $0.category == .model } == [
                .init(category: .model, message: "recording refused", error: "\(names) not on disk"),
            ])
            #expect(sink.entries.all.filter { $0.category == .session }.isEmpty)
            let made = try await offPool { try FileManager.default.contentsOfDirectory(atPath: root.path) }
            #expect(made.isEmpty)
        }
    }

    @Test func captureLogsOnlyFirstFormatAndFinalCounts() async throws {
        for side in ["microphone", "call"] {
            let sink = LogSpy()
            let source = AsyncThrowingStream<LiveAudio.AudioPiece, any Error>.makeStream()
            let spy = CaptureSpy(source: source.stream, stop: { source.continuation.finish() })
            let capture = LoggingCapture(base: spy, sink: sink, side: side)
            let output = try await capture.start()
            let pieces = [LiveAudio.AudioPiece(samples: [0.125, 0.375], sampleRate: 48_000),
                          LiveAudio.AudioPiece(samples: [0.625], sampleRate: 16_000)]
            pieces.forEach { source.continuation.yield($0) }
            let reader = Task {
                var received: [LiveAudio.AudioPiece] = []
                for try await piece in output { received.append(piece) }
                return received
            }
            try await capture.stop()
            #expect(try await reader.value == pieces)
            #expect(spy.calls.all == ["start", "stop"])
            #expect(sink.entries.all == [
                .init(category: .capture, message: "\(side) stream start"),
                .init(category: .capture, message: "\(side) first piece sampleRate=48000.0 channels=1 frames=2"),
                .init(category: .capture, message: "\(side) stream stopped pieces=2 frames=3"),
            ])
        }
        try await withComposeFolder { root in
            let sink = LogSpy()
            let rig = LogPieces(root: root, sink: sink)
            defer { rig.finish() }
            let folder = try await rig.pieces.create()
            try await rig.pieces.microphoneTrack.open(in: folder)
            try await rig.pieces.callTrack.open(in: folder)
            try await rig.pieces.microphoneCapture.start()
            try await rig.pieces.callCapture.start(selection: .everyAppButAudelin)
            try await rig.pieces.microphoneCapture.stop()
            try await rig.pieces.callCapture.stop()
            try await rig.pieces.microphoneTrack.close()
            try await rig.pieces.callTrack.close()
            for side in ["microphone", "call"] {
                #expect(sink.entries.all.filter { $0.category == .capture && $0.message.hasPrefix(side) } == [
                    .init(category: .capture, message: "\(side) stream start"),
                    .init(category: .capture, message: "\(side) first piece sampleRate=48000.0 channels=1 frames=2"),
                    .init(category: .capture, message: "\(side) stream stopped pieces=2 frames=3"),
                ])
                #expect(try await recordedSamples(URL(fileURLWithPath: folder.id).appendingPathComponent("\(side).caf")) == [0.25, -0.5, 0.125])
            }
        }
    }

    @Test func emptyCaptureReportsStreamStartAndStopFailures() async throws {
        for stage in ["stream", "start", "stop"] {
            let sink = LogSpy(), failure = LogFailure()
            let source = AsyncThrowingStream<LiveAudio.AudioPiece, any Error>.makeStream()
            let spy = CaptureSpy(source: source.stream, failure: stage == "start" ? failure : nil, stop: {
                if stage == "stop" { throw failure }
                source.continuation.finish()
            })
            let capture = LoggingCapture(base: spy, sink: sink, side: "microphone")
            if stage == "start" {
                do { _ = try await capture.start(); Issue.record("start must fail") }
                catch { #expect((error as? LogFailure) === failure) }
            } else {
                let output = try await capture.start()
                if stage == "stream" { source.continuation.finish(throwing: failure) }
                do { try await capture.stop(); #expect(stage == "stream") }
                catch { #expect((error as? LogFailure) === failure) }
                do {
                    for try await _ in output { Issue.record("empty source yielded audio") }
                    #expect(stage == "stop")
                } catch { #expect((error as? LogFailure) === failure) }
            }
            #expect(sink.entries.all == [
                .init(category: .capture, message: "microphone stream start"),
                .init(category: .capture, message: "microphone stream \(stage == "start" ? "start failed" : "stopped") pieces=0 frames=0", error: "sentinel failure"),
            ])
        }
    }

    @Test func recordingSubscriberLogsEveryDeliveredState() async throws {
        try await withComposeFolder { root in
            let sink = LogSpy()
            let rig = LogPieces(root: root, sink: sink)
            defer { rig.finish() }
            let recording = await composeRecording(initial: .init(automatic: true), access: testAccessPolicy(),
                makePieces: { _ in rig.pieces }, liveText: { false }, sink: sink, panel: ReadingClockSpy().panel(), makeModel: makeRecording, makeSession: makeSession)
            let conditions = RecordingConditions(recording: recording, microphoneAccess: { true },
                callsFolder: { true }, room: { true }, access: testAccessPolicy())
            await conditions.refresh()
            let processes = CoreAudioProcesses(binding: CallBinding(fails: false), clock: UnusedCallClock())
            let calls = try await composeCalls(processes, to: recording, conditions: conditions)
            for await state in await recording.states() {
                if state.phase == .recording { break }
            }
            await recording.send(.sessionReported(id: 1, .cannotRecord("disk unavailable")))
            await sink.wait { $0.category == .recording && $0.message.contains("phase=idle") && $0.error == "disk unavailable" }
            await calls.cancel()
            await processes.stop()
            await recording.end()

            let failures = AsyncStream<any Error>.makeStream()
            let menu = await AudelinMenu(storage: LogPreferencesStorage(), makeApplication: {
                MenuApplication(states: { await recording.states() }, failures: failures.stream,
                    send: recording.send, quit: {},
                    panelStates: { AsyncStream { $0.finish() } }, sendPanel: { _ in })
            }, openFolder: { _ in }, openURL: { _ in Issue.record("Unexpected URL open") }, terminate: {}, didDeliver: {}, sink: sink,
                presentPanel: { _ in }, sleep: { _ in throw CancellationError() })
            failures.continuation.finish()
            await menu.waitForObservers()
            let entries = sink.entries.all.filter { $0.category == .recording && $0.message.hasPrefix("state ") }
            #expect(entries.map { $0.message.components(separatedBy: " ")[1] } == [
                "phase=idle", "phase=idle", "phase=idle", "phase=idle", "phase=idle",
                "phase=beginning", "phase=beginning", "phase=recording", "phase=ending", "phase=idle",
            ])
            #expect(entries[0].message.contains("missing=[callAudioAccess,callsFolder,microphoneAccess,room]"))
            #expect(entries[4].message.contains("missing=[]"))
            #expect(entries[5].message.contains("why=call session=1 missing=[]"))
            #expect(entries.suffix(2).allSatisfy { $0.error == "disk unavailable" })
            #expect(sink.entries.all.filter { $0.category == .recording && !$0.message.hasPrefix("state ") }.map(\.message) == [
                "begin id=1 called", "begin id=1 report=ready", "end id=1 called", "end id=1 finished",
            ])
        }
    }

    @Test func recordingSessionLogsReportsAndEndAndSessionStateOmitsOpaqueIDs() async throws {
        for report: RecordingSessionReport in [.ready, .cannotRecord("no track"), .ended, .callSilent(true), .callSilent(false)] {
            let sink = LogSpy(), calls = Values<String>()
            let session = LoggingRecordingSession(base: RecordingSpy(report: report, calls: calls), sink: sink)
            #expect(await session.begin(id: 8) == report)
            await session.end(id: 8)
            #expect(calls.all == ["begin(8)", "end(8)"])
            #expect(sink.entries.all.first?.message == "begin id=8 called")
            #expect(sink.entries.all[1].message.contains("report="))
            #expect(sink.entries.all.suffix(2).map(\.message) == ["end id=8 called", "end id=8 finished"])
            if case .cannotRecord = report { #expect(sink.entries.all[1].error == "no track") }
        }
        let sink = LogSpy()
        StateLog(sink: sink).session(.init(
            phase: .ending, microphoneCapture: .closed, processSelection: .init(id: "secret selection"),
            failures: [.init(piece: "microphone", message: "device lost")], cannotRecord: "no track"
        ), id: 8)
        #expect(sink.entries.all[0].message.contains("id=8 phase=ending"))
        #expect(sink.entries.all[0].message.contains("microphoneCapture=closed"))
        #expect(!sink.entries.all[0].message.contains("secret selection"))
        #expect(sink.entries.all[0].error == "no track; microphone: device lost")
        try await withComposeFolder { root in
            let delivered = LogSpy()
            let rig = LogPieces(root: root, sink: delivered)
            defer { rig.finish() }
            let reports = Values<RecordingSessionReport>()
            let sessions = RecordingSessions(makePieces: { _ in rig.pieces }, liveText: { false },
                report: { id, report in #expect(id == 8); reports.append(report) },
                connect: subscribe, sink: delivered, panel: ReadingClockSpy().panel(), makeSession: makeSession)
            #expect(await sessions.begin(id: 8) == .ready)
            await sessions.end(id: 8)
            #expect(reports.all == [.callCreated(id: "1970.01.01-0000")])
            let states = delivered.entries.all.filter { $0.category == .session && $0.message.hasPrefix("state ") }
            let phases = states.map { $0.message.components(separatedBy: " ")[2] }
            #expect(phases.first == "phase=idle")
            #expect(phases.last == "phase=ended")
            #expect(Set(phases) == ["phase=idle", "phase=bringingUp", "phase=recording", "phase=ending", "phase=ended"])
            // Each piece's effect waits for the previous piece's event, so every status change is its own state.
            let pieces = states.map { $0.message.components(separatedBy: " ")[2...10].joined(separator: " ") }
            #expect(pieces == [
                "phase=idle folder=down processes=down microphoneTrack=down callTrack=down microphoneCapture=down callCapture=down transcript=down callText=down",
                "phase=bringingUp folder=down processes=down microphoneTrack=down callTrack=down microphoneCapture=down callCapture=down transcript=down callText=down",
                "phase=bringingUp folder=starting processes=down microphoneTrack=down callTrack=down microphoneCapture=down callCapture=down transcript=down callText=down",
                "phase=bringingUp folder=up processes=starting microphoneTrack=down callTrack=down microphoneCapture=down callCapture=down transcript=down callText=down",
                "phase=bringingUp folder=up processes=up microphoneTrack=starting callTrack=down microphoneCapture=down callCapture=down transcript=down callText=down",
                "phase=bringingUp folder=up processes=up microphoneTrack=up callTrack=starting microphoneCapture=down callCapture=down transcript=down callText=down",
                "phase=bringingUp folder=up processes=up microphoneTrack=up callTrack=up microphoneCapture=down callCapture=down transcript=starting callText=down",
                "phase=bringingUp folder=up processes=up microphoneTrack=up callTrack=up microphoneCapture=down callCapture=down transcript=up callText=starting",
                "phase=bringingUp folder=up processes=up microphoneTrack=up callTrack=up microphoneCapture=starting callCapture=down transcript=up callText=up",
                "phase=bringingUp folder=up processes=up microphoneTrack=up callTrack=up microphoneCapture=up callCapture=starting transcript=up callText=up",
                "phase=recording folder=up processes=up microphoneTrack=up callTrack=up microphoneCapture=up callCapture=up transcript=up callText=up",
                "phase=ending folder=up processes=up microphoneTrack=up callTrack=up microphoneCapture=stopping callCapture=up transcript=up callText=up",
                "phase=ending folder=up processes=up microphoneTrack=up callTrack=up microphoneCapture=closed callCapture=stopping transcript=up callText=up",
                "phase=ending folder=up processes=up microphoneTrack=stopping callTrack=up microphoneCapture=closed callCapture=closed transcript=up callText=up",
                "phase=ending folder=up processes=up microphoneTrack=closed callTrack=stopping microphoneCapture=closed callCapture=closed transcript=up callText=up",
                "phase=ending folder=up processes=up microphoneTrack=closed callTrack=closed microphoneCapture=closed callCapture=closed transcript=up callText=stopping",
                "phase=ending folder=up processes=up microphoneTrack=closed callTrack=closed microphoneCapture=closed callCapture=closed transcript=stopping callText=closed",
                "phase=ended folder=closed processes=closed microphoneTrack=closed callTrack=closed microphoneCapture=closed callCapture=closed transcript=closed callText=closed",
            ])
            #expect(states.allSatisfy { $0.message.hasPrefix("state id=8 ") && !$0.message.contains(root.path) })
            #expect(states.last?.message.contains("microphoneCapture=closed") == true)
            #expect(states.last?.message.contains("callCapture=closed") == true)
        }
    }

    @Test func statisticsWithoutAWarningWriteNoSessionStateLog() async throws {
        try await withSessionRig(connect: { _, _ in Task {} }) { rig, _ in
            let sink = LogSpy()
            let session = await makeSession(handler: rig.pieces.handler())
            let sessions = RecordingSessions(makePieces: { _ in rig.pieces }, liveText: { false },
                report: { _, _ in }, connect: subscribe, sink: sink,
                panel: ReadingClockSpy().panel(), makeSession: { _ in session })
            #expect(await sessions.begin(id: 1) == .ready)
            for index in 0..<20 {
                let start = Double(index), end = start + 1
                await session.send(.callAudioStatistics(start: start, end: end, hasFiniteNonzeroSample: false))
                await session.send(.microphoneLevel(start: start, end: end, rms: 0.5))
            }
            await sessions.end(id: 1)
            // The session reduces its events in order, so its ended state follows every statistic sent before.
            let ended = try await session.state { $0.phase == .ended }
            #expect(ended.audioWarning == nil)
            let recordingLogs = sink.entries.all.filter {
                $0.category == .session && $0.message.hasPrefix("state ") && $0.message.contains("phase=recording")
            }
            #expect(recordingLogs.count == 1)
            #expect(recordingLogs.first?.message.contains("audioWarning=none") == true)
        }
    }

    @Test func transcriptContentNeverReachesLog() async throws {
        let sink = LogSpy(), writes = Values<State>()
        let state = State(status: .listening, entries: [
            .init(speaker: .mine, text: .init(id: 1, start: 0, end: 1, settled: "private settled speech", pending: "private pending speech"), writtenLater: false),
        ])
        let base = TextSpy(state: state, writes: writes)
        let decorated = LoggingCallText(base: base, log: .init(sink: sink, name: "callText"))
        try await decorated.start(enabled: true)
        try await decorated.setEnabled(false)
        try await decorated.stop()
        #expect(writes.all == [state])
        #expect(sink.entries.all.map(\.message) == [
            "callText.start enabled=true called", "callText.start enabled=true succeeded",
            "callText.setEnabled enabled=false called", "callText.setEnabled enabled=false succeeded",
            "callText.stop called", "callText.stop succeeded",
        ])
        #expect(sink.entries.all.allSatisfy { $0.error == nil && $0.path == nil })
    }

    @Test func conditionsCallsAndModelReportDeliveryAndOutcomes() async throws {
        let sink = LogSpy(), events = Values<RecordingEvent>()
        let conditions = RecordingConditions(send: events.append, microphoneAccess: { false },
            callsFolder: { true }, room: { false }, sink: sink, access: testAccessPolicy())
        await conditions.refresh()
        await conditions.refresh()
        #expect(events.all.count == 4)
        #expect(sink.entries.all.map(\.message) == [
            "condition=microphoneAccess available=false", "condition=callAudioAccess available=true",
            "condition=callsFolder available=true", "condition=room available=false",
        ])
        let recording = await composedRecording(session: RecordingSpy(report: .ready, calls: Values<String>()))
        let source = AsyncThrowingStream<CallEvent, any Error>.makeStream()
        let calls = CallRecordingSubscription(calls: source.stream, recording: recording, sink: sink)
        source.continuation.yield(.started(app: "meeting.app"))
        source.continuation.yield(.ended(app: "meeting.app"))
        source.continuation.yield(.started(app: "other.app"))
        source.continuation.finish(throwing: LogFailure())
        await calls.wait()
        #expect(sink.entries.all.filter { $0.category == .calls } == [
            .init(category: .calls, message: "started app=meeting.app"), .init(category: .calls, message: "ended"),
            .init(category: .calls, message: "started app=other.app"),
            .init(category: .calls, message: "detection failed", error: "sentinel failure"),
            .init(category: .calls, message: "ended (detection stream ended)"),
        ])
        #expect(!(await recording.state()).callOn)
        await recording.end()
        let recognizer = ScriptRecognizer(hearings: [], endings: [])
        try await loadModel(recognizerSource: { recognizer }, sink: sink).value
        let failure = LogFailure()
        do { try await loadModel(recognizerSource: { throw failure }, sink: sink).value; Issue.record("load must fail") }
        catch { #expect((error as? LogFailure) === failure) }
        #expect(sink.entries.all.filter { $0.category == .model } == [
            .init(category: .model, message: "load started"), .init(category: .model, message: "load finished"),
            .init(category: .model, message: "load started"), .init(category: .model, message: "load failed", error: "sentinel failure"),
        ])
    }
}

private final class LogSpy: LogSink {
    let entries = Values<LogEntry>()
    private let delivery = AsyncStream<LogEntry>.makeStream()
    func write(_ entry: LogEntry) { entries.append(entry); delivery.continuation.yield(entry) }
    func wait(where matches: @Sendable (LogEntry) -> Bool) async {
        for await entry in delivery.stream { if matches(entry) { return } }
    }
    deinit { delivery.continuation.finish() }
}

private final class LogFailure: Error, CustomStringConvertible {
    var description: String { "sentinel failure" }
}

private final class PortSpy: SessionFolder, SessionProcesses, SessionMicrophoneCapture, SessionCallCapture, SessionTrackFile, SessionCallText, SessionTranscript {
    let failure: LogFailure?
    let calls = Values<String>()
    init(failure: LogFailure?) { self.failure = failure }
    private func record(_ call: String) throws {
        calls.append(call)
        if let failure { throw failure }
    }
    func create() async throws -> SessionCallFolder { try record("create"); return .init(id: "/private/calls/name") }
    func select() async throws -> SessionProcessSelection { try record("select"); return .init(id: "selection") }
    func start() async throws { try record("start") }
    func stop() async throws { try record("stop") }
    func start(selection: SessionCallCaptureSelection) async throws {
        switch selection {
        case let .chosen(selection): try record("chosen(\(selection.id))")
        case .everyAppButAudelin: try record("fallback")
        }
    }
    func open(in folder: SessionCallFolder) async throws { try record("open(\(folder.id))") }
    func close() async throws { try record("close") }
    func start(enabled: Bool) async throws { try record("start(\(enabled))") }
    func setEnabled(_ enabled: Bool) async throws { try record("enabled(\(enabled))") }
}

private final class CaptureSpy: Capture {
    let source: AsyncThrowingStream<LiveAudio.AudioPiece, any Error>
    let failure: LogFailure?
    let end: @Sendable () throws -> Void
    let calls = Values<String>()
    init(source: AsyncThrowingStream<LiveAudio.AudioPiece, any Error>, failure: LogFailure? = nil, stop: @escaping @Sendable () throws -> Void) {
        self.source = source; self.failure = failure; end = stop
    }
    func start() async throws -> AsyncThrowingStream<LiveAudio.AudioPiece, any Error> {
        calls.append("start")
        if let failure { throw failure }
        return source
    }
    func stop() async throws { calls.append("stop"); try end() }
}

private struct RecordingSpy: RecordingSession {
    let report: RecordingSessionReport
    let calls: Values<String>
    func begin(id: UInt64) async -> RecordingSessionReport { calls.append("begin(\(id))"); return report }
    func end(id: UInt64) async { calls.append("end(\(id))") }
}

private struct TextSpy: SessionCallText {
    let state: State
    let writes: Values<State>
    func start(enabled: Bool) async throws { writes.append(state) }
    func setEnabled(_ enabled: Bool) async throws {}
    func stop() async throws {}
}

private struct LogPreferencesStorage: PreferenceSettingsStorage {
    func read() -> Preferences { Preferences() }
    func write(_ preferences: Preferences) {}
}

private struct LogPieces: Sendable {
    let pieces: SessionPieces
    let microphone: CaptureScript<MicrophoneCapture.AudioPiece>
    let call: CaptureScript<SystemAudioCapture.AudioPiece>

    init(root: URL, sink: any LogSink, missingModels: [String] = []) {
        let microphone = CaptureScript<MicrophoneCapture.AudioPiece>(
            first: .init(samples: [0.25, -0.5], sampleRate: 48_000),
            last: .init(samples: [0.125], sampleRate: 48_000), fails: false)
        let call = CaptureScript<SystemAudioCapture.AudioPiece>(
            first: .init(samples: [0.25, -0.5], sampleRate: 48_000),
            last: .init(samples: [0.125], sampleRate: 48_000), fails: false)
        self.microphone = microphone
        self.call = call
        pieces = SessionPieces(
            folder: CallFolder(callsURL: root, now: { Date(timeIntervalSince1970: 0) }, timeZone: TimeZone(secondsFromGMT: 0)!),
            processes: CallAppProcesses(app: "meeting", list: SessionProcessList(answer: .success([]))),
            startMicrophone: { try microphone.start() }, startCall: { _ in try call.start() },
            microphoneRecognizerSource: { preconditionFailure("Live text is disabled") },
            callRecognizerSource: { preconditionFailure("Live text is disabled") },
            missingModels: { missingModels }, captureLogSink: sink)
    }

    func finish() { microphone.end(); call.end() }
}
