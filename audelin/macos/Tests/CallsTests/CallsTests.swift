import BlockingTestWork
import Darwin
import Foundation
import Synchronization
import Testing
import TrackFile
@testable import Calls

@Suite(.timeLimit(.minutes(1)))
struct CallsTests {
    @Test func S1_callsAreListedNewestFirst() async throws {
        try await withFolders { root in
            for name in ["2026.10.24-1405 Zoom", "2026.10.24-1405-2", "2026.10.25-0900 Синк"] {
                let folder = try make(root, name)
                try await track(folder.appendingPathComponent("microphone.caf"), seconds: 0.02)
                try await track(folder.appendingPathComponent("call.caf"), seconds: 0.04)
            }
            let calls = try adapter(root).list()
            #expect(calls.map(\.id) == ["2026.10.25-0900", "2026.10.24-1405-2", "2026.10.24-1405"])
            #expect(calls.map(\.title) == ["Синк", "", "Zoom"])
            #expect(calls.map(\.start) == [utc("2026-10-25T00:00:00Z"), utc("2026-10-24T05:05:00Z"), utc("2026-10-24T05:05:00Z")])
            #expect(calls.allSatisfy { abs(($0.duration ?? 0) - 0.04) < 0.0001 })
        }
    }

    @Test(arguments: ["", "microphone.caf", "call.caf", "*"])
    func durationClosureReceivesBothTracksAndKeepsTheCallOnFailure(failing: String) async throws {
        try await withFolders { root in
            let folder = try {
                let folder = try make(root, "2026.10.24-1405 Zoom")
                for name in ["microphone.caf", "call.caf"] {
                    try Data().write(to: folder.appendingPathComponent(name))
                }
                return folder
            }()
            let received = Mutex<[URL]>([])
            let sut = Calls(folder: root, timeZone: tokyo,
                            duration: { url in
                                received.withLock { $0.append(url) }
                                if failing == "*" || failing == url.lastPathComponent { throw POSIXError(.EACCES) }
                                return url.lastPathComponent == "microphone.caf" ? 12.5 : 3.25
                            },
                            transcript: { _ in [] },
                            disk: CallsDisk(
                                children: { _ in [folder] },
                                values: { try $0.resourceValues(forKeys: [.isDirectoryKey, .isSymbolicLinkKey]) },
                                copy: { try FileManager.default.copyItem(at: $0, to: $1) },
                                rename: { _, _ in throw POSIXError(.EIO) },
                                trash: { _ in throw POSIXError(.EPERM) },
                                remove: { _ in throw POSIXError(.EIO) }))
            #expect(received.withLock { $0.isEmpty })
            let calls = try sut.list()
            #expect(received.withLock { $0 } == [folder.appendingPathComponent("microphone.caf"), folder.appendingPathComponent("call.caf")])
            #expect(calls == [.init(id: "2026.10.24-1405", title: "Zoom", start: utc("2026-10-24T05:05:00Z"), duration: failing == "*" ? nil : failing == "microphone.caf" ? 3.25 : 12.5)])
        }
    }

    @Test(arguments: [Double.nan, .infinity, -.infinity, -1, 0, 7.5])
    func unusableDurationDoesNotHideTheOtherTrack(length: Double) async throws {
        try await withFolders { root in
            do {
                let folder = try make(root, "2026.10.24-1405 Zoom")
                for name in ["microphone.caf", "call.caf"] {
                    try Data().write(to: folder.appendingPathComponent(name))
                }
            }
            let sut = Calls(folder: root, timeZone: tokyo, duration: { url in
                url.lastPathComponent == "microphone.caf" ? length : 2.25
            }, transcript: { _ in [] }, disk: .system)
            let calls = try sut.list()
            #expect(calls == [.init(id: "2026.10.24-1405", title: "Zoom", start: utc("2026-10-24T05:05:00Z"), duration: length.isFinite && length >= 0 ? max(length, 2.25) : 2.25)])
        }
    }

    @Test func S2_whatIsNotACallIsLeftOut() async throws {
        try await withFolders { root in
            do {
                _ = try make(root, "2026.10.24-1405 Yes")
                _ = try make(root, "Notes")
                _ = try make(root, "2026.02.30-1405 invalid")
                _ = try make(root, "2026.10.24-1405-1 invalid")
                try Data([1, 2]).write(to: root.appendingPathComponent("2026.10.25-1405 file"))
                try FileManager.default.createSymbolicLink(at: root.appendingPathComponent("2026.10.26-1405 link"), withDestinationURL: root)
            }
            #expect(try adapter(root).list().map(\.title) == ["Yes"])
            #expect(try await names(root).count == 6)
            #expect(try await bytes(root.appendingPathComponent("2026.10.25-1405 file")) == Data([1, 2]))
        }
    }

    @Test func S3_aCallWithoutReadableAudioStillLists() async throws {
        try await withFolders { root in
            do {
                _ = try make(root, "2026.10.24-1405")
                let corrupt = try make(root, "2026.10.25-1405")
                try Data([0, 255, 42]).write(to: corrupt.appendingPathComponent("call.caf"))
            }
            let calls = try adapter(root).list()
            #expect(calls.map(\.id) == ["2026.10.25-1405", "2026.10.24-1405"])
            #expect(calls.allSatisfy { $0.duration == nil })
        }
    }

    @Test func S4_aRenameKeepsTheCall() async throws {
        try await withFolders { root in
            let original = try {
                let original = try make(root, "2026.10.24-1405 Zoom")
                try Data([0, 255, 42]).write(to: original.appendingPathComponent("transcript.md"))
                return original
            }()
            try adapter(root).rename(id: "2026.10.24-1405", title: "Онбординг: on-call/2")
            let renamed = root.appendingPathComponent("2026.10.24-1405 Онбординг- on-call-2")
            #expect(try await bytes(renamed.appendingPathComponent("transcript.md")) == Data([0, 255, 42]))
            #expect(await !exists(original))
            try adapter(root).rename(id: "2026.10.24-1405", title: "")
            #expect(try await bytes(root.appendingPathComponent("2026.10.24-1405/transcript.md")) == Data([0, 255, 42]))
            try adapter(root).rename(id: "2026.10.24-1405", title: "")
            #expect(try await names(root) == ["2026.10.24-1405"])
        }
    }

    @Test func S5_aRenameOntoATakenNameFails() async throws {
        for kind in ["file", "folder", "link"] {
            try await withFolders { root in
                let original = root.appendingPathComponent("2026.10.24-1405 Zoom")
                let target = root.appendingPathComponent("2026.10.24-1405 Синк")
                do {
                    _ = try make(root, original.lastPathComponent)
                    try Data([1]).write(to: original.appendingPathComponent("kept"))
                    if kind == "file" { try Data([2]).write(to: target) }
                    else if kind == "folder" { _ = try make(root, target.lastPathComponent); try Data([2]).write(to: target.appendingPathComponent("kept")) }
                    else { try FileManager.default.createSymbolicLink(at: target, withDestinationURL: original) }
                }
                await #expect(throws: (any Error).self) { try adapter(root).rename(id: "2026.10.24-1405", title: "Синк") }
                #expect(try await bytes(original.appendingPathComponent("kept")) == Data([1]))
                if kind != "link" { #expect(try await bytes(kind == "file" ? target : target.appendingPathComponent("kept")) == Data([2])) }
                #expect(try await names(root).count == 2)
            }
        }
    }

    @Test func S6_aDeleteMovesTheCallToTheTrash() async throws {
        try await withFolders { root in
            let call = root.appendingPathComponent("2026.10.24-1405 Zoom")
            let other = root.appendingPathComponent("2026.10.25-1405 Other")
            do {
                _ = try make(root, call.lastPathComponent)
                _ = try make(root, other.lastPathComponent)
                try Data([1]).write(to: call.appendingPathComponent("audio"))
                try Data([2]).write(to: other.appendingPathComponent("kept"))
            }
            try adapter(root).delete(id: "2026.10.24-1405")
            #expect(await !exists(call))
            #expect(try await bytes(trash(root).appendingPathComponent(call.lastPathComponent + "/audio")) == Data([1]))
            #expect(try await bytes(other.appendingPathComponent("kept")) == Data([2]))
        }
    }

    @Test func S9_aCallRenamedInFinderIsStillFound() async throws {
        for deleting in [false, true] {
            try await withFolders { root in
                let finder = root.appendingPathComponent("2026.10.24-1405 Finder")
                do {
                    let call = try make(root, "2026.10.24-1405 Zoom")
                    try FileManager.default.moveItem(at: call, to: finder)
                }
                let found = try adapter(root).location(id: "2026.10.24-1405")
                let paths = (found.resolvingSymlinksInPath().path, finder.resolvingSymlinksInPath().path)
                #expect(paths.0 == paths.1)
                do {
                    if deleting { try adapter(root).delete(id: "2026.10.24-1405") }
                    else { try adapter(root).rename(id: "2026.10.24-1405", title: "App") }
                }
                #expect(await !exists(finder))
                #expect(try adapter(root).list().map(\.title) == (deleting ? [] : ["App"]))
            }
        }
    }

    @Test func S10_aCallThatIsGoneFailsTheAction() async throws {
        try await withFolders { root in
            do {
                let call = try make(root, "2026.10.24-1405 Zoom")
                try FileManager.default.removeItem(at: call)
            }
            await #expect(throws: (any Error).self) { try adapter(root).rename(id: "2026.10.24-1405", title: "Gone") }
            await #expect(throws: (any Error).self) { try adapter(root).delete(id: "2026.10.24-1405") }
            await #expect(throws: (any Error).self) { try adapter(root).location(id: "2026.10.24-1405") }
            #expect(try await names(root).isEmpty)
        }
    }

    @Test func S11_countingTheCalls() async throws {
        try await withFolders { root in
            do {
                let first = try make(root, "2026.10.24-1405 A")
                let nested = try make(first, "nested")
                let second = try make(root, "2026.10.25-1405 B")
                try Data([1, 2, 3]).write(to: first.appendingPathComponent("one"))
                try Data([4, 5]).write(to: nested.appendingPathComponent("two"))
                try Data([6]).write(to: second.appendingPathComponent("three"))
                try Data([7, 8]).write(to: root.appendingPathComponent("not-a-call"))
                try FileManager.default.createSymbolicLink(at: first.appendingPathComponent("link"), withDestinationURL: second)
            }
            let count = try adapter(root).count()
            #expect(count.calls == 2)
            #expect(count.bytes == 6)
        }
    }

    @Test func diskFailuresReachTheCallerAndAFailedTrashLeavesTheFolder() async throws {
        try await withFolders { root in
            let trashed = Mutex<[URL]>([])
            let call = try {
                let call = try make(root, "2026.10.24-1405 Zoom")
                try Data([1]).write(to: call.appendingPathComponent("kept"))
                return call
            }()
            let sut = Calls(folder: root, timeZone: tokyo,
                            duration: { _ in throw POSIXError(.EIO) },
                            transcript: { _ in [] },
                            disk: CallsDisk(
                                children: { try FileManager.default.contentsOfDirectory(at: $0, includingPropertiesForKeys: nil) },
                                values: { try $0.resourceValues(forKeys: [.isDirectoryKey, .isSymbolicLinkKey, .fileSizeKey]) },
                                copy: { try FileManager.default.copyItem(at: $0, to: $1) },
                                rename: { _, _ in throw POSIXError(.EACCES) },
                                trash: { url in trashed.withLock { $0.append(url) }; throw POSIXError(.EACCES) },
                                remove: { url in Issue.record("Deletion removed \(url)") }))
            await #expect(throws: POSIXError(.EACCES)) { try sut.rename(id: "2026.10.24-1405", title: "New") }
            await #expect(throws: CallsFailure.trashFailed(folder: call.lastPathComponent, reason: POSIXError(.EACCES).localizedDescription)) {
                try sut.delete(id: "2026.10.24-1405")
            }
            #expect(trashed.withLock { $0.map(\.lastPathComponent) } == ["2026.10.24-1405 Zoom"])
            #expect(try await bytes(call.appendingPathComponent("kept")) == Data([1]))
            #expect(try sut.list().map(\.title) == ["Zoom"])
        }
    }
}

private let tokyo = TimeZone(identifier: "Asia/Tokyo")!
private func utc(_ value: String) -> Date { ISO8601DateFormatter().date(from: value)! }
/// The system disk, except that the Trash is a folder beside `root`: tests never touch the user's Trash.
private func adapter(_ root: URL, transcript: @escaping @Sendable (String) -> [Calls.Text.Line] = { _ in [] }) -> Calls {
    var disk = CallsDisk.system
    disk.trash = { url in
        try FileManager.default.createDirectory(at: trash(root), withIntermediateDirectories: true)
        try FileManager.default.moveItem(at: url, to: trash(root).appendingPathComponent(url.lastPathComponent))
    }
    return Calls(folder: root, timeZone: tokyo, duration: TrackFile.duration(at:), transcript: transcript, disk: disk)
}
private func trash(_ root: URL) -> URL { root.deletingLastPathComponent().appendingPathComponent(root.lastPathComponent + "-Trash", isDirectory: true) }
private func bytes(_ url: URL) async throws -> Data { try Data(contentsOf: url) }
private func exists(_ url: URL) async -> Bool { FileManager.default.fileExists(atPath: url.path) }
private func names(_ url: URL) async throws -> [String] { try FileManager.default.contentsOfDirectory(atPath: url.path).sorted() }
private func make(_ root: URL, _ name: String) throws -> URL {
    let url = root.appendingPathComponent(name, isDirectory: true)
    try FileManager.default.createDirectory(at: url, withIntermediateDirectories: true)
    return url
}
private func track(_ url: URL, seconds: Double) async throws {
    let track = try await TrackFile(url: url)
    try await track.write(Array(repeating: 0, count: Int(seconds * 48_000)), sampleRate: 48_000)
    try await track.close()
}
private func withFolders(_ body: (URL) async throws -> Void) async throws {
    let root = FileManager.default.temporaryDirectory.resolvingSymlinksInPath().appendingPathComponent(UUID().uuidString, isDirectory: true)
    try FileManager.default.createDirectory(at: root, withIntermediateDirectories: true)
    try await withCleanup { try await body(root) } cleanup: {
        try FileManager.default.removeItem(at: root)
        if FileManager.default.fileExists(atPath: trash(root).path) { try FileManager.default.removeItem(at: trash(root)) }
    }
}

@Suite(.timeLimit(.minutes(1)))
struct CallsTextTests {
    @Test func readsNotesAndHandsTheTranscriptToItsReader() async throws {
        try await withFolders { root in
            let folder = try make(root, "2026.11.10-1600 Синк по OKR")
            try Data("# Итоги\n\nOKR закрыты.".utf8).write(to: folder.appendingPathComponent("summary.md"))
            try Data("**Me** 00:00:05\nИтак".utf8).write(to: folder.appendingPathComponent("transcript.md"))
            let read = Mutex<[String]>([])
            let lines = [Calls.Text.Line(start: 5, words: "Итак")]
            let text = try adapter(root, transcript: { markdown in read.withLock { $0.append(markdown) }; return lines }).text(id: "2026.11.10-1600")
            #expect(text == .init(notes: "# Итоги\n\nOKR закрыты.", transcript: lines))
            #expect(read.withLock { $0 } == ["**Me** 00:00:05\nИтак"])
        }
    }

    @Test func aCallWithoutNotesOrTranscriptHasNoText() async throws {
        try await withFolders { root in
            let folder = try make(root, "2026.11.10-1600")
            try Data().write(to: folder.appendingPathComponent("summary.md"))
            #expect(try adapter(root).text(id: "2026.11.10-1600") == .init(notes: nil, transcript: []))
        }
    }

    @Test func anUnknownCallIsNotFound() async throws {
        try await withFolders { root in
            #expect(throws: CallsFailure.notFound(id: "2026.11.10-1600")) { try adapter(root).text(id: "2026.11.10-1600") }
        }
    }

    @Test func anUnreadableFileFails() async throws {
        try await withFolders { root in
            _ = try make(root, "2026.11.10-1600")
            var disk = CallsDisk.system
            disk.read = { _ in throw POSIXError(.EACCES) }
            let sut = Calls(folder: root, timeZone: tokyo, duration: { _ in 0 }, transcript: { _ in [] }, disk: disk)
            #expect(throws: POSIXError(.EACCES)) { try sut.text(id: "2026.11.10-1600") }
        }
    }
}
