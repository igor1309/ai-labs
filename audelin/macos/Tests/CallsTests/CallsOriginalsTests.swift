import Foundation
import Synchronization
import Testing
@testable import Calls

struct CallsOriginalsTests {
    @Test func discoveryUsesItsDiskAndStopsAtRecordedLeaves() throws {
        let fixture = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        try FileManager.default.createDirectory(at: fixture, withIntermediateDirectories: true)
        defer { try? FileManager.default.removeItem(at: fixture) }
        let file = fixture.appendingPathComponent("track")
        try Data().write(to: file)
        let root = URL(fileURLWithPath: "/virtual-calls"), a = "1970.01.01-1000", b = "1970.01.01-1001", c = "1970.01.01-1002"
        let outer = root.appendingPathComponent(a), nested = outer.appendingPathComponent(a)
        let leaves = [nested.appendingPathComponent(a), nested.appendingPathComponent(b), outer.appendingPathComponent(c)]
        let ignored = leaves[0].appendingPathComponent("1970.01.01-0900")
        let folders = [root: [outer], outer: [leaves[2], nested], nested: [leaves[1], leaves[0]], leaves[0]: [ignored], leaves[1]: [], leaves[2]: []]
        let tracks = Set(leaves.flatMap { [$0.appendingPathComponent("call.caf"), $0.appendingPathComponent("microphone.caf")] })
        let touched = Mutex<[URL]>([])
        var disk = CallsDisk.system
        disk.children = { url in
            touched.withLock { $0.append(url) }
            guard let children = folders[url] else { throw POSIXError(.ENOENT) }
            return children
        }
        disk.values = { url in
            if folders[url] != nil { return try fixture.resourceValues(forKeys: [.isDirectoryKey, .isSymbolicLinkKey]) }
            if tracks.contains(url) { return try file.resourceValues(forKeys: [.isDirectoryKey, .isSymbolicLinkKey]) }
            throw POSIXError(.ENOENT)
        }
        let calls = Calls(folder: root, timeZone: .gmt, duration: { _ in 4 }, transcript: { _ in [] }, disk: disk)
        let originals = try calls.originals(id: a)
        #expect(originals.map(\.id) == [a, b, c])
        #expect(originals.map(\.start) == [36_000.0, 36_060, 36_120].map(Date.init(timeIntervalSince1970:)))
        #expect(originals.map(\.duration) == [4, 4, 4])
        #expect(originals.map(\.callTrack) == leaves.map { $0.appendingPathComponent("call.caf") })
        #expect(originals.map(\.microphoneTrack) == leaves.map { $0.appendingPathComponent("microphone.caf") })
        #expect(!touched.withLock { paths in paths.contains(ignored) || leaves.contains(where: paths.contains) })
    }
}
