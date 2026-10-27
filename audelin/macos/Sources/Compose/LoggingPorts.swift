import Foundation
import Recording
import Session

struct LoggingFolder: SessionFolder {
    let base: any SessionFolder
    let log: PortLog

    func create() async throws -> SessionCallFolder {
        let folder = try await log.call("create") { try await base.create() }
        log.sink.write(.init(category: .session, message: "folder created", path: folder.id))
        return folder
    }
}

struct LoggingProcesses: SessionProcesses {
    let base: any SessionProcesses
    let log: PortLog

    func select() async throws -> SessionProcessSelection {
        try await log.call("select") { try await base.select() }
    }
}

struct LoggingMicrophone: SessionMicrophoneCapture {
    let base: any SessionMicrophoneCapture
    let log: PortLog

    func start() async throws { try await log.call("start") { try await base.start() } }
    func stop() async throws { try await log.call("stop") { try await base.stop() } }
}

struct LoggingCallCapture: SessionCallCapture {
    let base: any SessionCallCapture
    let log: PortLog

    func start(selection: SessionCallCaptureSelection) async throws {
        let mode = switch selection { case .chosen: "chosen"; case .everyAppButAudelin: "everyAppButAudelin" }
        try await log.call("start selection=\(mode)") { try await base.start(selection: selection) }
    }
    func stop() async throws { try await log.call("stop") { try await base.stop() } }
}

struct LoggingTrack: SessionTrackFile {
    let base: any SessionTrackFile
    let log: PortLog

    func open(in folder: SessionCallFolder) async throws {
        try await log.call("open", path: folder.id) { try await base.open(in: folder) }
    }
    func close() async throws { try await log.call("close") { try await base.close() } }
}

struct LoggingCallText: SessionCallText {
    let base: any SessionCallText
    let log: PortLog

    func start(enabled: Bool) async throws {
        try await log.call("start enabled=\(enabled)") { try await base.start(enabled: enabled) }
    }
    func setEnabled(_ enabled: Bool) async throws {
        try await log.call("setEnabled enabled=\(enabled)") { try await base.setEnabled(enabled) }
    }
    func stop() async throws { try await log.call("stop") { try await base.stop() } }
}

struct LoggingTranscript: SessionTranscript {
    let base: any SessionTranscript
    let log: PortLog

    func open(in folder: SessionCallFolder) async throws {
        try await log.call("open", path: folder.id) { try await base.open(in: folder) }
    }
    func close() async throws { try await log.call("close") { try await base.close() } }
}

struct LoggingRecordingSession: RecordingSession {
    let base: any RecordingSession
    let sink: any LogSink

    func begin(id: UInt64) async -> RecordingSessionReport {
        sink.write(.init(category: .recording, message: "begin id=\(id) called"))
        let report = await base.begin(id: id)
        switch report {
        case .ready, .ended:
            sink.write(.init(category: .recording, message: "begin id=\(id) report=\(report)"))
        case let .cannotRecord(error):
            sink.write(.init(category: .recording, message: "begin id=\(id) report=cannotRecord", error: error))
        }
        return report
    }

    func end(id: UInt64) async {
        sink.write(.init(category: .recording, message: "end id=\(id) called"))
        await base.end(id: id)
        sink.write(.init(category: .recording, message: "end id=\(id) finished"))
    }
}
