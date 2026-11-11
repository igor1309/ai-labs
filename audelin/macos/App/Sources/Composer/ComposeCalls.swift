import Calls
import Foundation
import Recordings

/// Disk work, including audio header reads, runs one operation at a time.
actor ComposeCalls: RecordingsCalls {
    private let disk: Calls

    init(disk: Calls) { self.disk = disk }

    func list() async throws -> [RecordedCall] {
        try perform { disk in
            try disk.list().map { .init(id: $0.id, title: $0.title, start: $0.start, duration: $0.duration) }
        }
    }

    func rename(id: String, title: String) async throws { try perform { try $0.rename(id: id, title: title) } }
    func delete(id: String) async throws { try perform { try $0.delete(id: id) } }
    func prepareMove(to destination: URL) async throws -> [MoveCall] {
        try perform { disk in
            let calls = try disk.list()
            if let first = calls.first {
                let source = try disk.location(id: first.id).deletingLastPathComponent().resolvingSymlinksInPath().standardizedFileURL
                if source.path == destination.resolvingSymlinksInPath().standardizedFileURL.path { return [] }
            }
            return try calls.map { .init(id: $0.id, title: $0.title, bytes: try disk.bytes(id: $0.id)) }
        }
    }
    func move(id: String, to destination: URL) async throws -> Int64 { try perform { try $0.move(id: id, to: destination) } }
    func location(id: String) async throws -> URL { try perform { try $0.location(id: id) } }

    private func perform<Value: Sendable>(_ work: (Calls) throws -> Value) throws -> Value {
        try work(disk)
    }
}

/// The disk can differ from the list after a failed mutation; refresh the disk view
/// after delivering the failure, retaining its reason until the next action.
func handleRecordingsEffect(_ handler: RecordingsEffectHandler, _ effect: RecordingsEffect) -> AsyncStream<RecordingsEvent> {
    AsyncStream { output in
        let task = Task {
            for await event in handler.handle(effect) {
                output.yield(event)
                switch event {
                case .renameFailed, .deleteFailed: output.yield(.reloadAfterFailure)
                default: break
                }
            }
            output.finish()
        }
        output.onTermination = { _ in task.cancel() }
    }
}
