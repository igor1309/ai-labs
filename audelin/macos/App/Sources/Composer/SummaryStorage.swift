import Calls
import Foundation
import Preferences
import SummaryFiles
import Synchronization
import TrackFile

/// One transaction boundary for call mutations and note publication, including
/// partially moved calls whose new root has not yet reached preferences.
final class SummaryStorage: SummaryFiles.Locations, Sendable {
    private struct State { var roots: [URL] }
    private let state: Mutex<State>
    private let timeZone: TimeZone
    private let queue = DispatchQueue(label: "audelin.call-storage")
    init(folder: URL, timeZone: TimeZone) { state = Mutex(State(roots: [folder])); self.timeZone = timeZone }
    private func calls(_ folder: URL) -> Calls { Calls(folder: folder, timeZone: timeZone, duration: TrackFile.duration(at:)) }
    func withFolder<Value: Sendable>(call: String, _ operation: @Sendable (URL) throws -> Value) throws -> Value {
        try state.withLock { state in
            let matches = state.roots.compactMap { try? calls($0).location(id: call) }
            guard matches.count == 1, let folder = matches.first else { throw CocoaError(.fileNoSuchFile) }
            return try operation(folder)
        }
    }
    func perform<Value: Sendable>(_ work: @escaping @Sendable () throws -> Value) async throws -> Value {
        try await withCheckedThrowingContinuation { done in queue.async { done.resume(with: Result(catching: work)) } }
    }
    func list() async throws -> [Calls.Call] {
        try await perform { [self] in
            try state.withLock { state in try state.roots.flatMap { try calls($0).list() }.sorted { $0.id > $1.id } }
        }
    }
    func rename(id: String, title: String) async throws {
        try await perform { [self] in try withFolder(call: id) { try calls($0.deletingLastPathComponent()).rename(id: id, title: title) } }
    }
    func delete(id: String) async throws {
        try await perform { [self] in try withFolder(call: id) { try calls($0.deletingLastPathComponent()).delete(id: id) } }
    }
    func location(id: String) async throws -> URL { try await perform { [self] in try withFolder(call: id) { $0 } } }
    func move(to folder: URL, commit: @escaping @Sendable () throws -> Void) async throws {
        try await perform { [self] in
            try state.withLock { state in
                guard let source = state.roots.last, source != folder else { return }
                if !state.roots.contains(folder) { state.roots.insert(folder, at: 0) }
                for call in try calls(source).list() {
                    let from = try calls(source).location(id: call.id)
                    let to = folder.appendingPathComponent(from.lastPathComponent)
                    try FileManager.default.moveItem(at: from, to: to)
                }
                try commit()
                state.roots = [folder]
            }
        }
    }
}
