import Calls
import Foundation
import Recordings

protocol CallsDisk: Sendable {
    func list() throws -> [Calls.Call]
    func rename(id: String, title: String) throws
    func delete(id: String) throws
    func location(id: String) throws -> URL
}

extension Calls: CallsDisk {}

/// All disk work, including audio header reads, stays on this dedicated queue.
final class ComposeCalls: RecordingsCalls, Sendable {
    private let disk: any CallsDisk
    private let queue = DispatchQueue(label: "audelin.calls")

    init(disk: any CallsDisk) { self.disk = disk }

    func list() async throws -> [RecordedCall] {
        try await perform { disk in
            try disk.list().map { .init(id: $0.id, title: $0.title, start: $0.start, duration: $0.duration) }
        }
    }

    func rename(id: String, title: String) async throws { try await perform { try $0.rename(id: id, title: title) } }
    func delete(id: String) async throws { try await perform { try $0.delete(id: id) } }
    func location(id: String) async throws -> URL { try await perform { try $0.location(id: id) } }

    private func perform<Value: Sendable>(_ work: @escaping @Sendable (any CallsDisk) throws -> Value) async throws -> Value {
        try await withCheckedThrowingContinuation { done in
            queue.async { [disk] in done.resume(with: Result { try work(disk) }) }
        }
    }
}

/// A failed mutation can leave a partially deleted folder; refresh the disk view
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
