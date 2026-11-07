import Calls
import Recordings
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
    private let journal: URL?
    private let timeZone: TimeZone
    private let queue = DispatchQueue(label: "audelin.call-storage")
    init(folder: URL, timeZone: TimeZone, journal: URL? = nil) {
        state = Mutex(State(roots: [Self.directory(folder)])); self.timeZone = timeZone; self.journal = journal
    }
    func restore() async throws {
        try await perform { [self] in
            guard let journal else { return }
            do {
                let saved = try JSONDecoder().decode([URL].self, from: Data(contentsOf: journal))
                guard !saved.isEmpty, saved.allSatisfy(\.isFileURL) else { throw CocoaError(.fileReadCorruptFile) }
                let roots = saved.map(Self.directory)
                guard Set(roots).count == roots.count else { throw CocoaError(.fileReadCorruptFile) }
                state.withLock { $0.roots = roots }
            } catch let error as CocoaError where error.code == .fileReadNoSuchFile { return }
        }
    }
    private func saveRoots(_ roots: [URL]) throws {
        if let journal {
            try FileManager.default.createDirectory(at: journal.deletingLastPathComponent(), withIntermediateDirectories: true)
            try JSONEncoder().encode(roots).write(to: journal, options: .atomic)
        }
    }
    private static func directory(_ url: URL) -> URL { URL(fileURLWithPath: url.standardizedFileURL.path, isDirectory: true) }
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
    func move(to destination: URL, commit: @escaping @Sendable () throws -> Void) async throws {
        let folder = Self.directory(destination)
        try await perform { [self] in
            try state.withLock { state in
                guard state.roots != [folder] else { return }
                if !state.roots.contains(folder) { state.roots.insert(folder, at: 0) }
                try saveRoots(state.roots)
                for source in state.roots where source != folder {
                    for call in try calls(source).list() {
                        let from = try calls(source).location(id: call.id)
                        let to = folder.appendingPathComponent(from.lastPathComponent)
                        try FileManager.default.moveItem(at: from, to: to)
                    }
                }
                try commit()
                try saveRoots([folder])
                state.roots = [folder]
            }
        }
    }
}


struct SummaryCalls: RecordingsCalls {
    let storage: SummaryStorage
    func list() async throws -> [RecordedCall] {
        try await storage.list().map { .init(id: $0.id, title: $0.title, start: $0.start, duration: $0.duration) }
    }
    func rename(id: String, title: String) async throws { try await storage.rename(id: id, title: title) }
    func delete(id: String) async throws { try await storage.delete(id: id) }
}
