import Foundation
import Testing
@testable import ScriptedSettings

@MainActor @Suite struct ScriptedSettingsTests {
    @Test func examplesDecode() throws {
        let root = URL(filePath: #filePath).deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent()
        let examples = root.appending(path: "Rehearsal/examples")
        let files = try FileManager.default.contentsOfDirectory(at: examples, includingPropertiesForKeys: nil).filter { $0.pathExtension == "json" }
        #expect(files.count >= 15)
        for file in files {
            let settings = try JSONDecoder().decode(Settings.self, from: Data(contentsOf: file))
            #expect(try JSONDecoder().decode(Settings.self, from: JSONEncoder().encode(settings)) == settings)
        }
    }

    @Test func validFile() throws {
        let f = try Files()
        var expected = Settings()
        expected.client.decision = .decline
        var second = Settings.Host()
        second.name = "MIZAN-B"
        second.amount = 98765
        expected.hosts.append(second)
        try f.write(expected)
        let loader = SettingsLoader(path: f.path, changes: Changes())
        #expect(loader.current() == .valid(expected))
    }

    @Test func unavailableKinds() throws {
        let f = try Files()
        let loader = SettingsLoader(path: f.path, changes: Changes())
        #expect(loader.current() == .unavailable(kind: .missing))
        try Data("{amount: 7654321}".utf8).write(to: URL(filePath: f.path))
        let result = loader.current()
        #expect(result == .unavailable(kind: .invalid))
        #expect(!String(describing: result).contains("7654321"))
    }

    @Test func changedFile() async throws {
        let f = try Files()
        try f.write(Settings())
        let changes = Changes()
        let loader = SettingsLoader(path: f.path, changes: changes)
        #expect(changes.directory == f.directory.path)
        try #require(changes.changed != nil)
        var next = Settings()
        next.client.decision = .decline
        next.bluetooth = .off
        try f.write(next)
        var iterator = loader.updates.makeAsyncIterator()
        changes.changed?()
        #expect(await iterator.next() == .valid(next))
        #expect(loader.current() == .valid(next))
    }

    @Test func mendedFile() async throws {
        let f = try Files()
        let changes = Changes()
        let loader = SettingsLoader(path: f.path, changes: changes)
        #expect(loader.current() == .unavailable(kind: .missing))
        try #require(changes.changed != nil)
        try f.write(Settings())
        var iterator = loader.updates.makeAsyncIterator()
        changes.changed?()
        #expect(await iterator.next() == .valid(Settings()))
    }

    @Test func defaultsAndValidation() throws {
        let f = try Files()
        let loader = SettingsLoader(path: f.path, changes: Changes())
        for json in ["{}", "{\"client\":{}}", "{\"hosts\":[{\"delays\":{}}]}"] {
            try Data(json.utf8).write(to: URL(filePath: f.path))
            #expect(loader.current() == .valid(Settings()))
        }
        for json in ["null", "[]", "{\"bluetooth\":\"wrong\"}",
                     "{\"client\":{\"drop\":\"wrong\"}}",
                     "{\"hosts\":[{\"amount\":-1}]}",
                     "{\"client\":{\"delays\":{\"decision\":-1}}}",
                     "{\"hosts\":[{\"readings\":[{\"time\":-1}]}]}"] {
            try Data(json.utf8).write(to: URL(filePath: f.path))
            #expect(loader.current() == .unavailable(kind: .invalid))
        }
    }
}

@MainActor private final class Changes: FileChanges, FileObservation {
    var directory: String?
    var changed: (@MainActor @Sendable () -> Void)?
    func watch(path: String, onChange: @escaping @MainActor @Sendable () -> Void) -> any FileObservation {
        self.directory = URL(filePath: path).deletingLastPathComponent().path
        changed = onChange
        return self
    }
    func cancel() { changed = nil }
}

private final class Files {
    let directory: URL
    var path: String { directory.appending(path: "settings.json").path }
    init() throws {
        directory = FileManager.default.temporaryDirectory.appending(path: UUID().uuidString)
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
    }
    func write(_ settings: Settings) throws {
        try JSONEncoder().encode(settings).write(to: URL(filePath: path), options: .atomic)
    }
    deinit { try? FileManager.default.removeItem(at: directory) }
}
