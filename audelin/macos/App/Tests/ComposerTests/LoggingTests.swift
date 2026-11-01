import BlockingTestWork
@testable import Audelin
@testable import CallText
import CallAppProcesses
import CallFolder
import CoreAudioProcesses
import Foundation
import protocol LiveAudio.Capture
import struct LiveAudio.AudioPiece
import Preferences
import Recording
import Session
import Testing
@testable import Composer

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
        let sink = LogSpy()
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
