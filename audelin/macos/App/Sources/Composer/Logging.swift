import Foundation
import Recording
import Session

// Keep private fields separate so a caller cannot accidentally make a path public.
public struct LogEntry: Sendable, Equatable {

    public enum Category: String, CaseIterable, Sendable {
        case calls, recording, session, capture, conditions, model, menu, reading, panel
    }

    public let category: Category
    public let message: String
    public var error: String? = nil
    public var path: String? = nil
    public init(category: Category, message: String, error: String? = nil, path: String? = nil) {
        self.category = category; self.message = message; self.error = error; self.path = path
    }

}

public protocol LogSink: Sendable {
    func write(_ entry: LogEntry)
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
            message: "state id=\(id) phase=\(state.phase) folder=\(state.folder) processes=\(state.processes) microphoneTrack=\(state.microphoneTrack) callTrack=\(state.callTrack) microphoneCapture=\(state.microphoneCapture) callCapture=\(state.callCapture) transcript=\(state.transcript) callText=\(state.callText) liveText=\(state.liveText) wantedLiveText=\(state.wantedLiveText) request=\(state.liveTextRequestID) pending=\(String(describing: state.pendingLiveText)) health=\(state.health) audioWarning=\(state.audioWarning.map { String(describing: $0) } ?? "none")",
            error: ([state.cannotRecord].compactMap { $0 } + state.failures.map { $0.description }).joined(separator: "; ").nilIfEmpty
        ))
    }
}

private extension String {
    var nilIfEmpty: String? { isEmpty ? nil : self }
}
