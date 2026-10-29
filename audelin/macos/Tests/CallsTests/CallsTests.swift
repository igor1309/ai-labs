import AVFoundation
import BlockingTestWork
import Darwin
import Foundation
import Testing
@testable import Calls

@Suite(.timeLimit(.minutes(1)))
struct CallsTests {
    @Test func S1_callsAreListedNewestFirst() async throws {
        try await withFolders { root in
            try await offPool {
                for name in ["2026.10.24-1405 Zoom", "2026.10.24-1405-2", "2026.10.25-0900 Синк"] {
                    let folder = try make(root, name)
                    try track(folder.appendingPathComponent("microphone.caf"), seconds: 0.02)
                    try track(folder.appendingPathComponent("call.caf"), seconds: 0.04)
                }
            }
            let calls = try await offPool { try adapter(root).list() }
            #expect(calls.map(\.id) == ["2026.10.25-0900", "2026.10.24-1405-2", "2026.10.24-1405"])
            #expect(calls.map(\.title) == ["Синк", "", "Zoom"])
            #expect(calls.map(\.start) == [utc("2026-10-25T00:00:00Z"), utc("2026-10-24T05:05:00Z"), utc("2026-10-24T05:05:00Z")])
            #expect(calls.allSatisfy { abs(($0.duration ?? 0) - 0.04) < 0.0001 })
        }
    }

    @Test func S2_whatIsNotACallIsLeftOut() async throws {
        try await withFolders { root in
            try await offPool {
                _ = try make(root, "2026.10.24-1405 Yes")
                _ = try make(root, "Notes")
                _ = try make(root, "2026.02.30-1405 invalid")
                _ = try make(root, "2026.10.24-1405-1 invalid")
                try Data([1, 2]).write(to: root.appendingPathComponent("2026.10.25-1405 file"))
                try FileManager.default.createSymbolicLink(at: root.appendingPathComponent("2026.10.26-1405 link"), withDestinationURL: root)
            }
            #expect(try await offPool { try adapter(root).list().map(\.title) } == ["Yes"])
            #expect(try await names(root).count == 6)
            #expect(try await bytes(root.appendingPathComponent("2026.10.25-1405 file")) == Data([1, 2]))
        }
    }

    @Test func S3_aCallWithoutReadableAudioStillLists() async throws {
        try await withFolders { root in
            try await offPool {
                _ = try make(root, "2026.10.24-1405")
                let corrupt = try make(root, "2026.10.25-1405")
                try Data([0, 255, 42]).write(to: corrupt.appendingPathComponent("call.caf"))
            }
            let calls = try await offPool { try adapter(root).list() }
            #expect(calls.map(\.id) == ["2026.10.25-1405", "2026.10.24-1405"])
            #expect(calls.allSatisfy { $0.duration == nil })
        }
    }

    @Test func S4_aRenameKeepsTheCall() async throws {
        try await withFolders { root in
            let original = try await offPool {
                let original = try make(root, "2026.10.24-1405 Zoom")
                try Data([0, 255, 42]).write(to: original.appendingPathComponent("transcript.md"))
                return original
            }
            try await offPool { try adapter(root).rename(id: "2026.10.24-1405", title: "Онбординг: on-call/2") }
            let renamed = root.appendingPathComponent("2026.10.24-1405 Онбординг- on-call-2")
            #expect(try await bytes(renamed.appendingPathComponent("transcript.md")) == Data([0, 255, 42]))
            #expect(await !exists(original))
            try await offPool { try adapter(root).rename(id: "2026.10.24-1405", title: "") }
            #expect(try await bytes(root.appendingPathComponent("2026.10.24-1405/transcript.md")) == Data([0, 255, 42]))
            try await offPool { try adapter(root).rename(id: "2026.10.24-1405", title: "") }
            #expect(try await names(root) == ["2026.10.24-1405"])
        }
    }

    @Test func S5_aRenameOntoATakenNameFails() async throws {
        for kind in ["file", "folder", "link"] {
            try await withFolders { root in
                let original = root.appendingPathComponent("2026.10.24-1405 Zoom")
                let target = root.appendingPathComponent("2026.10.24-1405 Синк")
                try await offPool {
                    _ = try make(root, original.lastPathComponent)
                    try Data([1]).write(to: original.appendingPathComponent("kept"))
                    if kind == "file" { try Data([2]).write(to: target) }
                    else if kind == "folder" { _ = try make(root, target.lastPathComponent); try Data([2]).write(to: target.appendingPathComponent("kept")) }
                    else { try FileManager.default.createSymbolicLink(at: target, withDestinationURL: original) }
                }
                await #expect(throws: (any Error).self) { try await offPool { try adapter(root).rename(id: "2026.10.24-1405", title: "Синк") } }
                #expect(try await bytes(original.appendingPathComponent("kept")) == Data([1]))
                if kind != "link" { #expect(try await bytes(kind == "file" ? target : target.appendingPathComponent("kept")) == Data([2])) }
                #expect(try await names(root).count == 2)
            }
        }
    }

    @Test func S6_aDeleteRemovesTheCall() async throws {
        try await withFolders { root in
            let call = root.appendingPathComponent("2026.10.24-1405 Zoom")
            let other = root.appendingPathComponent("2026.10.25-1405 Other")
            try await offPool {
                _ = try make(root, call.lastPathComponent)
                _ = try make(root, other.lastPathComponent)
                try Data([1]).write(to: call.appendingPathComponent("audio"))
                try Data([2]).write(to: other.appendingPathComponent("kept"))
            }
            try await offPool { try adapter(root).delete(id: "2026.10.24-1405") }
            #expect(await !exists(call))
            #expect(try await bytes(other.appendingPathComponent("kept")) == Data([2]))
        }
    }

    @Test func S9_aCallRenamedInFinderIsStillFound() async throws {
        for deleting in [false, true] {
            try await withFolders { root in
                let finder = root.appendingPathComponent("2026.10.24-1405 Finder")
                try await offPool {
                    let call = try make(root, "2026.10.24-1405 Zoom")
                    try FileManager.default.moveItem(at: call, to: finder)
                }
                let found = try await offPool { try adapter(root).location(id: "2026.10.24-1405") }
                let paths = await offPool { (found.resolvingSymlinksInPath().path, finder.resolvingSymlinksInPath().path) }
                #expect(paths.0 == paths.1)
                try await offPool {
                    if deleting { try adapter(root).delete(id: "2026.10.24-1405") }
                    else { try adapter(root).rename(id: "2026.10.24-1405", title: "App") }
                }
                #expect(await !exists(finder))
                #expect(try await offPool { try adapter(root).list().map(\.title) } == (deleting ? [] : ["App"]))
            }
        }
    }

    @Test func S10_aCallThatIsGoneFailsTheAction() async throws {
        try await withFolders { root in
            try await offPool {
                let call = try make(root, "2026.10.24-1405 Zoom")
                try FileManager.default.removeItem(at: call)
            }
            await #expect(throws: (any Error).self) { try await offPool { try adapter(root).rename(id: "2026.10.24-1405", title: "Gone") } }
            await #expect(throws: (any Error).self) { try await offPool { try adapter(root).delete(id: "2026.10.24-1405") } }
            await #expect(throws: (any Error).self) { try await offPool { try adapter(root).location(id: "2026.10.24-1405") } }
            #expect(try await names(root).isEmpty)
        }
    }

    @Test func S11_countingTheCalls() async throws {
        try await withFolders { root in
            try await offPool {
                let first = try make(root, "2026.10.24-1405 A")
                let nested = try make(first, "nested")
                let second = try make(root, "2026.10.25-1405 B")
                try Data([1, 2, 3]).write(to: first.appendingPathComponent("one"))
                try Data([4, 5]).write(to: nested.appendingPathComponent("two"))
                try Data([6]).write(to: second.appendingPathComponent("three"))
                try Data([7, 8]).write(to: root.appendingPathComponent("not-a-call"))
                try FileManager.default.createSymbolicLink(at: first.appendingPathComponent("link"), withDestinationURL: second)
            }
            let count = try await offPool { try adapter(root).count() }
            #expect(count.calls == 2)
            #expect(count.bytes == 6)
        }
    }

    @Test func diskFailuresReachTheCallerAndPartialDeletionIsNamed() async throws {
        try await withFolders { root in
            let call = try await offPool {
                let call = try make(root, "2026.10.24-1405 Zoom")
                try Data([1]).write(to: call.appendingPathComponent("kept"))
                return call
            }
            let sut = Calls(folder: root, timeZone: tokyo,
                            children: { try FileManager.default.contentsOfDirectory(at: $0, includingPropertiesForKeys: nil) },
                            values: { try $0.resourceValues(forKeys: [.isDirectoryKey, .isSymbolicLinkKey, .fileSizeKey]) },
                            duration: { _ in throw POSIXError(.EIO) },
                            rename: { _, _ in throw POSIXError(.EACCES) },
                            remove: { url in try FileManager.default.removeItem(at: url.appendingPathComponent("kept")); throw POSIXError(.EACCES) })
            await #expect(throws: POSIXError(.EACCES)) { try await offPool { try sut.rename(id: "2026.10.24-1405", title: "New") } }
            do { try await offPool { try sut.delete(id: "2026.10.24-1405") }; Issue.record("Deletion should fail") }
            catch { #expect(error.localizedDescription.contains("часть папки могла остаться")) }
            #expect(await exists(call))
            #expect(try await offPool { try sut.list().map(\.title) } == ["Zoom"])
        }
    }
}

private let tokyo = TimeZone(identifier: "Asia/Tokyo")!
private func utc(_ value: String) -> Date { ISO8601DateFormatter().date(from: value)! }
private func adapter(_ root: URL) -> Calls { Calls(folder: root, timeZone: tokyo) }
private func bytes(_ url: URL) async throws -> Data { try await offPool { try Data(contentsOf: url) } }
private func exists(_ url: URL) async -> Bool { await offPool { FileManager.default.fileExists(atPath: url.path) } }
private func names(_ url: URL) async throws -> [String] { try await offPool { try FileManager.default.contentsOfDirectory(atPath: url.path).sorted() } }
private func make(_ root: URL, _ name: String) throws -> URL {
    let url = root.appendingPathComponent(name, isDirectory: true)
    try FileManager.default.createDirectory(at: url, withIntermediateDirectories: true)
    return url
}
private func track(_ url: URL, seconds: Double) throws {
    let format = AVAudioFormat(standardFormatWithSampleRate: 16_000, channels: 1)!
    let file = try AVAudioFile(forWriting: url, settings: format.settings)
    let buffer = AVAudioPCMBuffer(pcmFormat: format, frameCapacity: AVAudioFrameCount(seconds * 16_000))!
    buffer.frameLength = buffer.frameCapacity
    memset(buffer.floatChannelData![0], 0, Int(buffer.frameLength) * MemoryLayout<Float>.size)
    try file.write(from: buffer)
}
private func withFolders(_ body: (URL) async throws -> Void) async throws {
    let root = await offPool { FileManager.default.temporaryDirectory.resolvingSymlinksInPath().appendingPathComponent(UUID().uuidString, isDirectory: true) }
    try await offPool { try FileManager.default.createDirectory(at: root, withIntermediateDirectories: true) }
    try await withCleanup { try await body(root) } cleanup: { try FileManager.default.removeItem(at: root) }
}
