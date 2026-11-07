import BlockingTestWork
import Darwin
import Foundation
import Testing
@testable import Calls

@Suite(.timeLimit(.minutes(1)))
struct CallsMoveTests {
    @Test func moveKeepsEveryFileAndIdentityAfterAFinderRename() async throws {
        try await withMoveFolders { (source: URL, target: URL) async throws in
            try await offPool { try FileManager.default.moveItem(at: source.appendingPathComponent(name), to: source.appendingPathComponent(id + " Finder")) }
            let disk = Calls(folder: source, timeZone: .gmt, duration: { _ in 0 })
            #expect(try await offPool { try disk.move(id: id, to: target) } == 7)
            #expect(try await offPool { try FileManager.default.contentsOfDirectory(atPath: source.path).isEmpty })
            #expect(try await offPool { try FileManager.default.contentsOfDirectory(atPath: target.path) } == [id + " Finder"])
            #expect(try await offPool { try Data(contentsOf: target.appendingPathComponent(id + " Finder/nested/two")) } == Data([4, 5, 6, 7]))
            #expect(try await offPool { try Data(contentsOf: target.appendingPathComponent(id + " Finder/one")) } == Data([1, 2, 3]))
        }
    }

    @Test(arguments: ["copy", "sizes", "read", "missing", "rename", "delete", "partialDelete"])
    func failureRestoresTheWholeSourceAndRemovesOnlyItsCopy(step: String) async throws {
        try await withMoveFolders { (source: URL, target: URL) async throws in
            let original = source.appendingPathComponent(name)
            try await offPool { try Data([99]).write(to: target.appendingPathComponent("unrelated")) }
            let disk = Calls(folder: source, timeZone: .gmt,
                children: { try FileManager.default.contentsOfDirectory(at: $0, includingPropertiesForKeys: nil) },
                values: { url in
                    if step == "read", url.path.contains("/target/"), url.lastPathComponent == "one" { throw POSIXError(.EIO) }
                    return try url.resourceValues(forKeys: [.isDirectoryKey, .isSymbolicLinkKey, .fileSizeKey])
                }, duration: { _ in 0 },
                copy: { from, to in
                    try FileManager.default.copyItem(at: from, to: to)
                    if from.lastPathComponent == name, from.deletingLastPathComponent().lastPathComponent == "source" {
                        if step == "copy" { throw POSIXError(.ENOSPC) }
                        if step == "sizes" {
                            try Data([1, 2]).write(to: to.appendingPathComponent("one"))
                            try Data([4, 5, 6, 7, 8]).write(to: to.appendingPathComponent("nested/two"))
                        }
                        if step == "missing" { try FileManager.default.removeItem(at: to.appendingPathComponent("nested/two")) }
                    }
                }, rename: { from, to in
                    if step == "rename" { throw POSIXError(.EACCES) }
                    guard renamex_np(from.path, to.path, UInt32(RENAME_EXCL)) == 0 else { throw POSIXError(.EIO) }
                }, remove: { url in
                    if url.lastPathComponent == name, url.deletingLastPathComponent().lastPathComponent == "source" {
                        if step == "partialDelete" { try FileManager.default.removeItem(at: url.appendingPathComponent("one")) }
                        if step == "delete" || step == "partialDelete" { throw POSIXError(.EACCES) }
                    }
                    try FileManager.default.removeItem(at: url)
                })
            await #expect(throws: (any Error).self) { try await offPool { try disk.move(id: id, to: target) } }
            #expect(try await offPool { try FileManager.default.contentsOfDirectory(atPath: source.path) } == [name])
            #expect(try await offPool { try Data(contentsOf: original.appendingPathComponent("one")) } == Data([1, 2, 3]))
            #expect(try await offPool { try Data(contentsOf: original.appendingPathComponent("nested/two")) } == Data([4, 5, 6, 7]))
            #expect(try await offPool { try FileManager.default.contentsOfDirectory(atPath: target.path) } == ["unrelated"])
            #expect(try await offPool { try Data(contentsOf: target.appendingPathComponent("unrelated")) } == Data([99]))
        }
    }

    @Test(arguments: ["file", "directory", "link"])
    func occupiedTargetIsNeverOverwritten(kind: String) async throws {
        try await withMoveFolders { (source: URL, target: URL) async throws in
            let occupied = target.appendingPathComponent(name)
            try await offPool {
                if kind == "directory" { try FileManager.default.createDirectory(at: occupied, withIntermediateDirectories: false) }
                else if kind == "link" { try FileManager.default.createSymbolicLink(at: occupied, withDestinationURL: source) }
                else { try Data([99]).write(to: occupied) }
            }
            let disk = Calls(folder: source, timeZone: .gmt, duration: { _ in 0 })
            await #expect(throws: (any Error).self) { try await offPool { try disk.move(id: id, to: target) } }
            #expect(try await offPool { try FileManager.default.contentsOfDirectory(atPath: target.path) } == [name])
            #expect(try await offPool { try Data(contentsOf: source.appendingPathComponent(name + "/one")) } == Data([1, 2, 3]))
            if kind == "file" { #expect(try await offPool { try Data(contentsOf: occupied) } == Data([99])) }
        }
    }

    @Test func missingCallAndDestinationInsideTheCallFailWithoutChanges() async throws {
        try await withMoveFolders { (source: URL, target: URL) async throws in
            let disk = Calls(folder: source, timeZone: .gmt, duration: { _ in 0 })
            await #expect(throws: (any Error).self) { try await offPool { try disk.move(id: "gone", to: target) } }
            await #expect(throws: (any Error).self) { try await offPool { try disk.move(id: id, to: source.appendingPathComponent(name + "/nested")) } }
            #expect(try await offPool { try FileManager.default.contentsOfDirectory(atPath: target.path).isEmpty })
            #expect(try await offPool { try Data(contentsOf: source.appendingPathComponent(name + "/nested/two")) } == Data([4, 5, 6, 7]))
        }
    }
}

private let id = "2026.10.24-1405"
private let name = id + " Zoom"
private func withMoveFolders(_ work: @escaping @Sendable (URL, URL) async throws -> Void) async throws {
    let root = await offPool { FileManager.default.temporaryDirectory.resolvingSymlinksInPath().appendingPathComponent(UUID().uuidString) }
    let source = root.appendingPathComponent("source"), target = root.appendingPathComponent("target")
    try await offPool {
        try FileManager.default.createDirectory(at: source.appendingPathComponent(name + "/nested"), withIntermediateDirectories: true)
        try FileManager.default.createDirectory(at: target, withIntermediateDirectories: true)
        try Data([1, 2, 3]).write(to: source.appendingPathComponent(name + "/one"))
        try Data([4, 5, 6, 7]).write(to: source.appendingPathComponent(name + "/nested/two"))
    }
    try await withCleanup { try await work(source, target) } cleanup: { try FileManager.default.removeItem(at: root) }
}
