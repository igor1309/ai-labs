import Composer
import Foundation
import Recording
import Testing

/// What the composed application writes to the boundary's log sink.
@MainActor
@Suite(.timeLimit(.minutes(1)))
struct LoggingTests {

    @Test func everyPortLogsItsCallAndOutcomeAndKeepsPathsInTheirOwnField() async throws {

        try await withComposition { rig in
            try await rig.start()
            try await rig.stop()
            let entries = rig.log.entries.all
            let messages = entries.filter { $0.category == .session }.map(\.message)
            for port in [
                "folder.create", "microphoneCapture.start", "microphoneCapture.stop",
                "callCapture.start selection=everyAppButAudelin", "callCapture.stop",
                "microphoneTrack.open", "microphoneTrack.close", "callTrack.open", "callTrack.close",
                "callText.start enabled=true", "callText.stop", "transcript.open", "transcript.close",
            ] {
                #expect(messages.filter { $0 == "\(port) called" }.count == 1, "\(port)")
                #expect(messages.filter { $0 == "\(port) succeeded" }.count == 1, "\(port)")
            }
            let folder = rig.folder().path
            #expect(entries.contains { $0.message == "folder created" && $0.path == folder })
            #expect(entries.contains { $0.message == "transcript.open called" && $0.path == folder })
            #expect(entries.allSatisfy { !$0.message.contains(rig.root.path) })
            // Started by hand, there is no call app to select, and that is the one port to fail.
            let ports = entries.filter { $0.category == .session && !$0.message.hasPrefix("state ") }
            #expect(ports.filter { $0.error != nil } == [
                .init(category: .session, message: "processes.select failed", error: "noCallApp"),
            ])
        }
    }

    @Test func aDetectedCallLogsItsSelection() async throws {

        let binding = CallBinding(fails: false, input: true)
        try await withComposition(preferences: { .init(automaticRecording: true, liveText: false, callsFolder: $0) },
            configure: { $0.processes = FixtureProcesses(binding: binding) }) { rig in
            _ = try await rig.state { $0.phase == .recording }
            let messages = rig.log.entries.all.map(\.message)
            #expect(messages.contains("processes.select succeeded"))
            #expect(messages.contains("callCapture.start selection=chosen succeeded"))
            try await rig.stop()
        }
    }

    @Test func aFailingPortLogsItsErrorAndTheSessionSeesIt() async throws {

        try await withComposition(microphoneFails: true) { rig in
            await rig.menu.perform(.start)
            await rig.log.wait { $0.message == "microphoneCapture.start failed" }
            let failed = rig.log.entries.all.filter { $0.message == "microphoneCapture.start failed" }
            #expect(failed == [.init(category: .session, message: "microphoneCapture.start failed", error: "failed")])
            #expect(!rig.log.entries.all.contains { $0.message == "microphoneCapture.start succeeded" })
        }
    }

    @Test(arguments: ["microphone", "call"])
    func captureLogsOnlyItsFirstFormatAndFinalCounts(side: String) async throws {

        try await withComposition { rig in
            try await rig.start()
            try await rig.stop()
            #expect(rig.log.entries.all.filter { $0.category == .capture && $0.message.hasPrefix("\(side) ") } == [
                .init(category: .capture, message: "\(side) stream start"),
                .init(category: .capture, message: "\(side) first piece sampleRate=48000.0 channels=1 frames=2"),
                .init(category: .capture, message: "\(side) stream stopped pieces=2 frames=3"),
            ])
        }
    }

    @Test(arguments: ["stream", "start", "stop"])
    func anEmptyCaptureReportsItsFailure(stage: String) async throws {

        let source = AsyncThrowingStream<CaptureBuffer, any Error>.makeStream()
        defer { source.continuation.finish() }
        try await withComposition(configure: { boundary in
            boundary.microphone = FixtureMicrophone {
                if stage == "start" { throw ScriptFailure.failed }
                if stage == "stream" { source.continuation.finish(throwing: ScriptFailure.failed) }
                return StartedCapture(stream: source.stream, stop: {
                    if stage == "stop" { throw ScriptFailure.failed }
                    source.continuation.finish()
                })
            }
        }) { rig in
            try await rig.start()
            try await rig.stop()
            await rig.log.wait { $0.category == .capture && $0.message.hasPrefix("microphone stream s") && $0.message.hasSuffix("frames=0") }
            #expect(rig.log.entries.all.filter { $0.category == .capture && $0.message.hasPrefix("microphone ") } == [
                .init(category: .capture, message: "microphone stream start"),
                .init(category: .capture, message: "microphone stream \(stage == "start" ? "start failed" : "stopped") pieces=0 frames=0", error: "failed"),
            ])
        }
    }

    @Test func recordingSessionLogsBeginItsReportAndEnd() async throws {

        try await withComposition { rig in
            try await rig.start()
            try await rig.stop()
            let messages = rig.log.entries.all.map(\.message)
            #expect(messages.filter { $0 == "begin id=1 called" }.count == 1)
            #expect(messages.contains { $0.hasPrefix("begin id=1 report=") && $0.contains("ready") })
            #expect(messages.filter { $0 == "end id=1 called" }.count == 1)
            #expect(messages.filter { $0 == "end id=1 finished" }.count == 1)
            let order = ["begin id=1 called", "end id=1 called", "end id=1 finished"].compactMap(messages.firstIndex)
            #expect(order == order.sorted() && order.count == 3)
        }
    }

    @Test func aRefusedBeginLogsItsReason() async throws {

        try await withComposition(microphoneFails: true, configure: { boundary in
            boundary.callAudio = FixtureCallAudio { _ in throw ScriptFailure.failed }
        }) { rig in
            await rig.menu.perform(.start)
            let state = try await rig.state { $0.phase == .idle && $0.cannotRecord != nil }
            await rig.log.wait { $0.message.hasPrefix("begin id=1 report=") }
            let report = try #require(rig.log.entries.all.first { $0.message.hasPrefix("begin id=1 report=") })
            #expect(report.error == state.cannotRecord)
        }
    }

    @Test func sessionStateNamesItsPartsButNoOpaqueIdentifiers() async throws {

        try await withComposition(microphoneFails: true) { rig in
            await rig.menu.perform(.start)
            await rig.log.wait { $0.message.hasPrefix("state id=1 ") && $0.error?.contains("failed") == true }
            let states = rig.log.entries.all.filter { $0.message.hasPrefix("state id=1 ") }
            #expect(states.contains { $0.message.contains("phase=") && $0.message.contains("microphoneCapture=") })
            #expect(states.allSatisfy { !$0.message.contains(rig.root.path) })
            #expect(states.allSatisfy { $0.message.range(of: "[0-9A-Fa-f]{8}-[0-9A-Fa-f]{4}-", options: .regularExpression) == nil })
        }
    }

    @Test func spokenWordsNeverReachTheLog() async throws {

        let mine = SessionRecognizer(name: "secretmine"), theirs = SessionRecognizer(name: "secrettheirs")
        try await withComposition(recognizers: (mine, theirs)) { rig in
            try await rig.start()
            _ = try await rig.panel { if case let .lines(lines) = $0.log { !lines.entries.isEmpty } else { false } }
            try await rig.stop()
            let transcript = try await transcriptText(of: rig)
            #expect(transcript.contains("secretmine") && transcript.contains("secrettheirs"))
            for entry in rig.log.entries.all {
                let logged = [entry.message, entry.error ?? "", entry.path ?? ""].joined(separator: " ")
                #expect(!logged.contains("secret"), "\(logged)")
            }
        }
    }

    /// The crash writer reads this count; it is the save's own, not one
    /// worked out later from the file.
    @Test func eachTranscriptSaveLogsItsFinalCount() async throws {

        try await withComposition { rig in
            try await rig.start()
            try await rig.stop()
            let counts = rig.log.entries.all.filter { $0.category == .session && $0.message.hasPrefix("transcript saved finalCount=") }
            #expect(counts.last?.message == "transcript saved finalCount=2")
            let numbers = counts.compactMap { Int($0.message.dropFirst("transcript saved finalCount=".count)) }
            #expect(numbers.count == counts.count && numbers == numbers.sorted())
            let transcript = try await transcriptText(of: rig)
            #expect(transcript.contains("mine final") && transcript.contains("theirs final"))
        }
    }
}
