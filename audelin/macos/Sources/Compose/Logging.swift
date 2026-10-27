import Foundation
import os
import Recording
import Session

// Keep private fields separate so a caller cannot accidentally make a path public.
struct LogEntry: Sendable, Equatable {

    enum Category: String, CaseIterable, Sendable {
        case calls, recording, session, capture, conditions, model, menu, reading
    }

    let category: Category
    let message: String
    var error: String? = nil
    var path: String? = nil
}

protocol LogSink: Sendable {
    func write(_ entry: LogEntry)
}

struct SystemLogSink: LogSink {

    private let loggers = Dictionary(uniqueKeysWithValues: LogEntry.Category.allCases.map {
        ($0, Logger(subsystem: "dev.igor1309.audelin", category: $0.rawValue))
    })

    func write(_ entry: LogEntry) {

        let logger = loggers[entry.category]!
        if let error = entry.error {
            logger.error("\(entry.message, privacy: .public) error=\(error, privacy: .public) path=\(entry.path ?? "", privacy: .private)")
        } else {
            logger.notice("\(entry.message, privacy: .public) path=\(entry.path ?? "", privacy: .private)")
        }
    }
}

struct PortLog: Sendable {

    let sink: any LogSink
    let name: String

    func call<Value: Sendable>(
        _ operation: String, path: String? = nil,
        perform: () async throws -> Value
    ) async throws -> Value {

        sink.write(.init(category: .session, message: "\(name).\(operation) called", path: path))
        do {
            let value = try await perform()
            sink.write(.init(category: .session, message: "\(name).\(operation) succeeded", path: path))
            return value
        } catch {
            sink.write(.init(category: .session, message: "\(name).\(operation) failed", error: String(describing: error), path: path))
            throw error
        }
    }

}

struct StateLog: Sendable {

    let sink: any LogSink

    func recording(_ state: RecordingState) {

        let missing = state.missing.map { String(describing: $0) }.sorted().joined(separator: ",")
        sink.write(.init(
            category: .recording,
            message: "state phase=\(state.phase) why=\(state.session.map { String(describing: $0.origin) } ?? "none") session=\(state.session?.id ?? 0) missing=[\(missing)] automatic=\(state.automatic) callOn=\(state.callOn) heldForCall=\(state.heldForCall) pendingCall=\(state.pendingCall)",
            error: state.cannotRecord
        ))
    }

    func session(_ state: SessionState, id: UInt64) {

        // Folder and process identifiers are opaque; never format the whole state.
        sink.write(.init(
            category: .session,
            message: "state id=\(id) phase=\(state.phase) folder=\(state.folder) processes=\(state.processes) microphoneTrack=\(state.microphoneTrack) callTrack=\(state.callTrack) microphoneCapture=\(state.microphoneCapture) callCapture=\(state.callCapture) transcript=\(state.transcript) callText=\(state.callText) liveText=\(state.liveText) wantedLiveText=\(state.wantedLiveText) request=\(state.liveTextRequestID) pending=\(String(describing: state.pendingLiveText)) health=\(state.health)",
            error: ([state.cannotRecord].compactMap { $0 } + state.failures.map { $0.description }).joined(separator: "; ").nilIfEmpty
        ))
    }
}

private extension String {
    var nilIfEmpty: String? { isEmpty ? nil : self }
}

/// Owns state delivery independently of the menu's observation lifetime.
final class RecordingStateLogging: Sendable {

    private let task: Task<Void, Never>

    init(recording: Recording, sink: any LogSink) async {

        // Registration retains every change before composition exposes Recording to startup sources.
        let states = await recording.states()
        task = Task {
            for await state in states { StateLog(sink: sink).recording(state) }
        }
    }

    deinit { task.cancel() }
}
