import CallDomain
import CallsCore
import FileCallStore
import Foundation
import Testing

/// Call-store QA scenarios (`docs/spec/call-store/QA.md`).
@Suite struct FileCallStoreTests {
    @Test func s1CreatingACall() throws {
        let setup = try Setup()
        let details = CallDetails(start: at(14, 30), app: "Zoom", captured: [.mic, .call])

        let folder = try FileCallStore(root: setup.root).create(title: "Zoom", details: details)

        #expect(folder.lastPathComponent == "2026.10.21-1430 Zoom")
        let meta = setup.meta(in: folder)
        #expect(meta?["id"] as? String == details.id.description)
        #expect(meta?["start"] as? String == ISO8601DateFormatter().string(from: at(14, 30)))
    }

    @Test func s2ListingCalls() throws {
        let setup = try Setup()
        let fixtures = try setup.threeCalls()

        let calls = try FileCallStore(root: setup.root).list().compactMap(\.call)

        #expect(calls.map(\.details).sorted(by: earlier) == fixtures.map(\.details))
        #expect(calls.sorted(by: { earlier($0.details, $1.details) }).map(\.title) == fixtures.map(\.title))
    }

    @Test func s3UnreadableDetails() throws {
        let setup = try Setup()
        let fixtures = try setup.threeCalls()
        let damaged = fixtures[1].folder.appendingPathComponent("meta.json")
        let meta = try Data(contentsOf: damaged)
        try meta.prefix(meta.count / 2).write(to: damaged)

        let entries = try FileCallStore(root: setup.root).list()

        let unreadable = entries.compactMap { entry -> String? in
            if case .unreadable(let folder) = entry { folder.path } else { nil }
        }
        #expect(unreadable == [fixtures[1].folder.path])
        #expect(entries.compactMap(\.call).map(\.details).sorted(by: earlier)
            == [fixtures[0].details, fixtures[2].details])
    }

    @Test func s4RenamingKeepsTheCall() throws {
        let setup = try Setup()
        let call = try setup.call("Zoom", at: at(14, 30))
        let inFinder = try setup.call("Telemost", at: at(15, 0))
        let store = FileCallStore(root: setup.root)

        let renamed = try store.rename(call.details.id, to: "Планёрка")
        let moved = setup.root.appendingPathComponent("Ретро")
        try run("/bin/mv", inFinder.folder.path, moved.path)

        #expect(renamed.lastPathComponent == "2026.10.21-1430 Планёрка")
        #expect(store.folder(of: call.details.id)?.path == renamed.path)
        #expect(store.folder(of: inFinder.details.id)?.path == moved.path)
    }

    @Test func s5TrashingACall() throws {
        let setup = try Setup()
        let call = try setup.call("Zoom", at: at(14, 30))
        let store = FileCallStore(root: setup.root)

        let trashed = try store.trash(call.details.id)
        defer { setup.removeFromTrash(trashed) }

        #expect(trashed.path.hasPrefix(Setup.trash.path + "/"))
        #expect(FileManager.default.fileExists(atPath: trashed.appendingPathComponent("meta.json").path))
        #expect(try store.list().compactMap(\.call).map(\.details.id).contains(call.details.id) == false)
        #expect(FileManager.default.fileExists(atPath: call.folder.path) == false)
    }

    @Test func s6ChangesFromFinder() async throws {
        let setup = try Setup()
        let call = try setup.call("Zoom", at: at(14, 30))
        let events = Events()
        let watch = FileCallStore(root: setup.root).watch { events.add($0) }
        defer { watch.cancel() }

        try run("/bin/mv", call.folder.path, setup.root.appendingPathComponent("Ретро").path)

        #expect(await eventually(within: 2) { events.all.contains(.changed(call.details.id)) })
    }

    @Test func s7CopyingACall() throws {
        let setup = try Setup()
        let clean = try setup.call("Zoom", at: at(14, 30), files: ["audio/mic-e0-t000000000000000.wav": 100_000])
        let flipped = try setup.call("Telemost", at: at(15, 0), files: ["audio/mic-e0-t000000000000000.wav": 100_000])
        let other = try setup.folder("other")
        let store = FileCallStore(root: setup.root)

        let cleanCopy = try store.copy(clean.details.id, to: other)
        #expect(throws: Never.self) { try store.deleteSource(after: cleanCopy) }
        #expect(FileManager.default.fileExists(atPath: clean.folder.path) == false)
        #expect(FileManager.default.fileExists(atPath: other.appendingPathComponent(clean.folder.lastPathComponent).path))

        let flippedCopy = try store.copy(flipped.details.id, to: other)
        let flippedFolder = try #require(FileCallStore(root: other).folder(of: flipped.details.id))
        flipByte(in: flippedFolder.appendingPathComponent("audio/mic-e0-t000000000000000.wav"), at: 50_000)
        #expect(throws: CallStoreError.copyDiffers) { try store.deleteSource(after: flippedCopy) }
        #expect(FileManager.default.fileExists(atPath: flipped.folder.appendingPathComponent("meta.json").path))
    }

    @Test func s7TheSourceRenamedBeforeItsDeletion() throws {
        let setup = try Setup()
        let call = try setup.call("Zoom", at: at(14, 30), files: ["audio/mic-e0-t000000000000000.wav": 100_000])
        let other = try setup.folder("other")
        let store = FileCallStore(root: setup.root)
        let copy = try store.copy(call.details.id, to: other)

        let renamed = setup.root.appendingPathComponent("Ретро")
        try run("/bin/mv", call.folder.path, renamed.path)

        #expect(throws: Never.self) { try store.deleteSource(after: copy) }
        #expect(FileManager.default.fileExists(atPath: renamed.path) == false)
    }

    @Test func s8AFolderAlreadyAtTheTarget() throws {
        let setup = try Setup()
        let call = try setup.call("Zoom", at: at(14, 30))
        let other = try setup.folder("other")
        let there = try setup.call("Zoom", at: at(14, 30), in: other, files: ["final.md": 1_000])

        #expect(throws: CallStoreError.targetExists) {
            try FileCallStore(root: setup.root).copy(call.details.id, to: other)
        }

        #expect(FileManager.default.fileExists(atPath: there.folder.appendingPathComponent("final.md").path))
    }

    @Test func s8AFailedCopy() throws {
        let setup = try Setup()
        let call = try setup.call("Zoom", at: at(14, 30), files: ["audio/mic-e0-t000000000000000.wav": 20_000_000])
        let before = try setup.contents(of: call.folder)
        let image = try DiskImage(megabytes: 5)
        defer { image.detach() }

        #expect(throws: CallStoreError.diskFull) {
            try FileCallStore(root: setup.root).copy(call.details.id, to: image.mountPoint)
        }

        #expect(try setup.contents(of: call.folder) == before)
        let left = try FileManager.default.contentsOfDirectory(atPath: image.mountPoint.path)
            .filter { !$0.hasPrefix(".") }
        #expect(left == [])
    }

    @Test func s9ACallRemovedInFinder() async throws {
        let setup = try Setup()
        let call = try setup.call("Zoom", at: at(14, 30))
        let events = Events()
        let watch = FileCallStore(root: setup.root).watch { events.add($0) }
        defer { watch.cancel() }

        var trashed: NSURL?
        try FileManager.default.trashItem(at: call.folder, resultingItemURL: &trashed)
        defer { trashed.map { setup.removeFromTrash($0 as URL) } }

        #expect(await eventually(within: 2) { events.all.contains(.removed(call.details.id)) })
    }

    @Test func s10UpdatedDetails() throws {
        let setup = try Setup()
        var details = try setup.call("Zoom", at: at(14, 30)).details
        details.duration = 1832
        details.captured = [.call]

        try FileCallStore(root: setup.root).save(details)

        let listed = try FileCallStore(root: setup.root).list().compactMap(\.call).map(\.details)
        #expect(listed == [details])
    }

    @Test func s11TheSizeOfTheCalls() throws {
        let setup = try Setup()
        for (index, megabytes) in [1, 2, 3].enumerated() {
            try setup.call("Zoom", at: at(14, 30 + index), files: ["audio/mic-e0-t000000000000000.wav": megabytes * 1_000_000])
        }
        let sum = try setup.bytesOfFiles()

        #expect(try FileCallStore(root: setup.root).totalSize() == sum)
    }
}

// MARK: - Fixtures

private struct Setup {
    static let trash = FileManager.default.homeDirectoryForCurrentUser.appendingPathComponent(".Trash")

    let base: URL
    let root: URL

    init() throws {
        base = FileManager.default.temporaryDirectory.appendingPathComponent("audelin-store-\(UUID().uuidString)")
        root = base.appendingPathComponent("calls")
        try FileManager.default.createDirectory(at: root, withIntermediateDirectories: true)
    }

    struct Fixture {
        var details: CallDetails
        var title: String
        var folder: URL
    }

    /// A call folder written by hand, as an earlier version of the app or
    /// the user's copy would leave it.
    @discardableResult
    func call(
        _ title: String, at start: Date, duration: Int? = nil, app: String = "Zoom",
        captured: [Track] = [.mic, .call], in root: URL? = nil, files: [String: Int] = [:]
    ) throws -> Fixture {
        let id = CallID()
        let folder = (root ?? self.root).appendingPathComponent(CallFolderName.make(start: start, title: title, taken: []))
        try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
        let sides = captured.map { "\"\($0.rawValue)\"" }.joined(separator: ",")
        let json = """
            {"id":"\(id)","start":"\(ISO8601DateFormatter().string(from: start))",\
            \(duration.map { "\"duration\":\($0)," } ?? "")"app":"\(app)","captured":[\(sides)]}
            """
        try Data(json.utf8).write(to: folder.appendingPathComponent("meta.json"))
        for (path, size) in files {
            let file = folder.appendingPathComponent(path)
            try FileManager.default.createDirectory(at: file.deletingLastPathComponent(), withIntermediateDirectories: true)
            try Data((0..<size).map { UInt8(truncatingIfNeeded: $0 &* 31) }).write(to: file)
        }
        let details = CallDetails(
            id: id, start: start, duration: duration.map(TimeInterval.init), app: app, captured: Set(captured))
        return Fixture(details: details, title: title, folder: folder)
    }

    func threeCalls() throws -> [Fixture] {
        [
            try call("Zoom", at: at(9, 0), duration: 1800, app: "Zoom"),
            try call("Планёрка", at: at(11, 15), duration: 600, app: "Telemost", captured: [.call]),
            try call("Q3-Q4 план", at: at(16, 45), duration: 3725, app: "Google Chrome", captured: [.mic]),
        ]
    }

    func folder(_ name: String) throws -> URL {
        let folder = base.appendingPathComponent(name)
        try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
        return folder
    }

    func meta(in folder: URL) -> [String: Any]? {
        guard let data = try? Data(contentsOf: folder.appendingPathComponent("meta.json")) else { return nil }
        return (try? JSONSerialization.jsonObject(with: data)) as? [String: Any]
    }

    /// Every file under `folder` by its path inside it.
    func contents(of folder: URL) throws -> [String: Data] {
        var contents: [String: Data] = [:]
        for path in try FileManager.default.subpathsOfDirectory(atPath: folder.path) {
            let file = folder.appendingPathComponent(path)
            var isDirectory: ObjCBool = false
            if FileManager.default.fileExists(atPath: file.path, isDirectory: &isDirectory), !isDirectory.boolValue {
                contents[path] = try Data(contentsOf: file)
            }
        }
        return contents
    }

    func bytesOfFiles() throws -> Int {
        try contents(of: root).values.reduce(0) { $0 + $1.count }
    }

    /// Removes what a test put in the Trash, and nothing else.
    func removeFromTrash(_ item: URL) {
        guard item.path.hasPrefix(Self.trash.path + "/") else { return }
        try? FileManager.default.removeItem(at: item)
    }
}

private func at(_ hour: Int, _ minute: Int) -> Date {
    Calendar.current.date(from: DateComponents(year: 2026, month: 10, day: 21, hour: hour, minute: minute))!
}

private func earlier(_ a: CallDetails, _ b: CallDetails) -> Bool { a.start < b.start }

private func flipByte(in file: URL, at offset: Int) {
    guard var data = try? Data(contentsOf: file), offset < data.count else { return }
    data[offset] ^= 0xFF
    try? data.write(to: file)
}

private func run(_ tool: String, _ arguments: String...) throws {
    let process = Process()
    process.executableURL = URL(fileURLWithPath: tool)
    process.arguments = arguments
    try process.run()
    process.waitUntilExit()
    guard process.terminationStatus == 0 else { throw CocoaError(.fileWriteUnknown) }
}

private final class Events: @unchecked Sendable {
    private let lock = NSLock()
    private var events: [CallChange] = []

    func add(_ event: CallChange) { lock.withLock { events.append(event) } }

    var all: [CallChange] { lock.withLock { events } }
}

private func eventually(within seconds: Double, _ condition: () -> Bool) async -> Bool {
    let deadline = Date().addingTimeInterval(seconds)
    while Date() < deadline {
        if condition() { return true }
        try? await Task.sleep(for: .milliseconds(20))
    }
    return condition()
}

/// A small HFS+ disk image, to fill.
private struct DiskImage {
    let mountPoint: URL
    private let image: URL

    init(megabytes: Int) throws {
        let base = FileManager.default.temporaryDirectory
            .appendingPathComponent("audelin-full-\(UUID().uuidString)")
        image = base.appendingPathExtension("dmg")
        mountPoint = base
        try run("/usr/bin/hdiutil", "create", "-size", "\(megabytes)m", "-fs", "HFS+", "-volname", "audelin-full", image.path)
        try FileManager.default.createDirectory(at: mountPoint, withIntermediateDirectories: true)
        try run("/usr/bin/hdiutil", "attach", "-nobrowse", "-mountpoint", mountPoint.path, image.path)
    }

    func detach() {
        try? run("/usr/bin/hdiutil", "detach", mountPoint.path, "-force")
        try? FileManager.default.removeItem(at: image)
    }
}
