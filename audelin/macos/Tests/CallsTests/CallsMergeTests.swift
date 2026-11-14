import Foundation
import Testing
@testable import Calls

/// Merged calls on disk, with track lengths given by a fake reader keyed on a call's
/// folder name, so a span is exact.
@Suite(.timeLimit(.minutes(1)))
struct CallsMergeTests {

    @Test func S4_aMergedCallsDurationSpansItsParts() throws {
        try withRoot { root in
            let merged = try folder(root, "2026.10.24-1000 Sync")
            try call(merged, "2026.10.24-1000 Sync", seconds: 20 * 60)
            try call(merged, "2026.10.24-1010", seconds: 5 * 60)
            let calls = try sut(root, lengths: ["2026.10.24-1000 Sync": 20 * 60, "2026.10.24-1010": 5 * 60]).list()
            #expect(calls.map(\.id) == ["2026.10.24-1000"])
            #expect(calls.first?.duration == TimeInterval(20 * 60))
        }
    }

    @Test func aLaterPartEndingLastSetsTheSpan() throws {
        try withRoot { root in
            let merged = try folder(root, "2026.10.24-1000")
            try call(merged, "2026.10.24-1000", seconds: 8 * 60)
            try call(merged, "2026.10.24-1010", seconds: 5 * 60)
            let calls = try sut(root, lengths: ["2026.10.24-1000": 8 * 60, "2026.10.24-1010": 5 * 60]).list()
            #expect(calls.first?.duration == TimeInterval(15 * 60))
        }
    }

    @Test func aMergedPartsPartsCount() throws {
        try withRoot { root in
            let merged = try folder(root, "2026.10.24-1000")
            let inner = try folder(merged, "2026.10.24-1000")
            try call(inner, "2026.10.24-1000", seconds: 60)
            try call(inner, "2026.10.24-1030", seconds: 60)
            try call(merged, "2026.10.24-1010", seconds: 60)
            let calls = try sut(root, lengths: ["2026.10.24-1000": 60, "2026.10.24-1030": 60, "2026.10.24-1010": 60]).list()
            #expect(calls.map(\.id) == ["2026.10.24-1000"])
            #expect(calls.first?.duration == TimeInterval(31 * 60))
        }
    }

    @Test func S1_onlyTopLevelCallsAreListed() throws {
        try withRoot { root in
            let merged = try folder(root, "2026.10.24-1000 Sync")
            try call(merged, "2026.10.24-1000 Sync", seconds: 60)
            try call(merged, "2026.10.24-1010", seconds: 60)
            try call(root, "2026.10.25-0900", seconds: 60)
            let calls = try sut(root, lengths: ["2026.10.24-1000 Sync": 60, "2026.10.24-1010": 60, "2026.10.25-0900": 60]).list()
            #expect(calls.map(\.id) == ["2026.10.25-0900", "2026.10.24-1000"])
            #expect(calls.map(\.title) == ["", "Sync"])
        }
    }

    @Test func aPartWithoutAKnownLengthLeavesTheSpanUnknown() throws {
        try withRoot { root in
            let merged = try folder(root, "2026.10.24-1000")
            try call(merged, "2026.10.24-1000", seconds: 60)
            try call(merged, "2026.10.24-1010", seconds: 60)
            let calls = try sut(root, lengths: ["2026.10.24-1000": 60]).list()
            #expect(calls.map(\.id) == ["2026.10.24-1000"])
            #expect(calls.first?.duration == nil)
        }
    }

    @Test func S1_S2_aMergedCallTakesItsPartsPlaceAndKeepsThemWhole() throws {
        try withRoot { root in
            try call(root, "2026.10.24-1010", seconds: 60, transcript: "b")
            try call(root, "2026.10.24-1000 Sync", seconds: 60, transcript: "a")
            let before = try files(root)
            let sut = sut(root, lengths: ["2026.10.24-1000 Sync": 60, "2026.10.24-1010": 60])
            let id = try sut.merge(ids: ["2026.10.24-1010", "2026.10.24-1000"]) { folder in
                try Data("joined".utf8).write(to: folder.appendingPathComponent("transcript.md"))
            }
            #expect(id == "2026.10.24-1000")
            let calls = try sut.list()
            #expect(calls.map(\.id) == ["2026.10.24-1000"])
            #expect(calls.map(\.title) == ["Sync"])
            #expect(try names(root) == ["2026.10.24-1000 Sync"])
            let merged = root.appendingPathComponent("2026.10.24-1000 Sync")
            #expect(try names(merged) == ["2026.10.24-1000 Sync", "2026.10.24-1010", "transcript.md"])
            for (path, data) in before {
                #expect(try Data(contentsOf: merged.appendingPathComponent(path)) == data)
            }
        }
    }

    @Test func S3_aMergedCallReadsAsOne() throws {
        try withRoot { root in
            try call(root, "2026.10.24-1000", seconds: 60, transcript: "a only")
            try call(root, "2026.10.24-1010", seconds: 60, transcript: "b only")
            let sut = Calls(folder: root, timeZone: utc, duration: { _ in 60 },
                            transcript: { [Calls.Text.Line(start: 0, words: $0)] }, disk: .system)
            try sut.merge(ids: ["2026.10.24-1000", "2026.10.24-1010"]) { folder in
                try Data("joined".utf8).write(to: folder.appendingPathComponent("transcript.md"))
            }
            #expect(try sut.text(id: "2026.10.24-1000").transcript.map(\.words) == ["joined"])
        }
    }

    @Test func S5_theFolderBeingPreparedIsNotListed() throws {
        try withRoot { root in
            try call(root, "2026.10.24-1000", seconds: 60)
            try call(root, "2026.10.24-1010", seconds: 60)
            let sut = sut(root, lengths: ["2026.10.24-1000": 60, "2026.10.24-1010": 60])
            var seen: [String] = []
            try sut.merge(ids: ["2026.10.24-1000", "2026.10.24-1010"]) { folder in
                #expect(folder.deletingLastPathComponent().standardizedFileURL == root.standardizedFileURL)
                seen = try sut.list().map(\.id)
                try Data("joined".utf8).write(to: folder.appendingPathComponent("transcript.md"))
            }
            #expect(seen == ["2026.10.24-1010", "2026.10.24-1000"])
        }
    }

    @Test func S8_aMergedCallIsDeletedWithItsParts() throws {
        try withRoot { root in
            try call(root, "2026.10.24-1000", seconds: 60)
            try call(root, "2026.10.24-1010", seconds: 60)
            let trash = root.appendingPathComponent("Trash", isDirectory: false).deletingLastPathComponent()
                .appendingPathComponent(root.lastPathComponent + "-Trash")
            defer { try? FileManager.default.removeItem(at: trash) }
            var disk = CallsDisk.system
            disk.trash = { url in
                try FileManager.default.createDirectory(at: trash, withIntermediateDirectories: true)
                try FileManager.default.moveItem(at: url, to: trash.appendingPathComponent(url.lastPathComponent))
            }
            let sut = Calls(folder: root, timeZone: utc, duration: { _ in 60 }, transcript: { _ in [] }, disk: disk)
            try sut.merge(ids: ["2026.10.24-1000", "2026.10.24-1010"]) { _ in }
            try sut.delete(id: "2026.10.24-1000")
            #expect(try sut.list().isEmpty)
            #expect(try names(trash.appendingPathComponent("2026.10.24-1000")) == ["2026.10.24-1000", "2026.10.24-1010"])
        }
    }

    @Test func S9_aMergedCallMovesWithItsParts() throws {
        try withRoot { root in
            try withRoot { target in
                try call(root, "2026.10.24-1000", seconds: 60)
                try call(root, "2026.10.24-1010", seconds: 60)
                let calls = sut(root, lengths: ["2026.10.24-1000": 60, "2026.10.24-1010": 60])
                try calls.merge(ids: ["2026.10.24-1000", "2026.10.24-1010"]) { _ in }
                try calls.move(id: "2026.10.24-1000", to: target)
                let moved = try sut(target, lengths: ["2026.10.24-1000": 60, "2026.10.24-1010": 60]).list()
                #expect(moved.map(\.id) == ["2026.10.24-1000"])
                #expect(moved.first?.duration == TimeInterval(11 * 60))
                #expect(try names(target.appendingPathComponent("2026.10.24-1000")) == ["2026.10.24-1000", "2026.10.24-1010"])
            }
        }
    }

    @Test func S11_eachPartsTranscriptIsReadAsWritten() throws {
        try withRoot { root in
            try call(root, "2026.10.24-1000", seconds: 60, transcript: "# Transcript\r\n\r\nwords")
            try call(root, "2026.10.24-1010", seconds: 60)
            let sut = sut(root, lengths: [:])
            #expect(try sut.savedTranscript(id: "2026.10.24-1000") == Data("# Transcript\r\n\r\nwords".utf8))
        }
    }

    @Test func S6_aMergeFailingAfterAPartMovedLeavesTheParts() throws {
        try withRoot { root in
            try call(root, "2026.10.24-1000", seconds: 60, transcript: "a")
            try call(root, "2026.10.24-1010", seconds: 60, transcript: "b")
            let before = try files(root)
            var disk = CallsDisk.system
            disk.rename = { source, target in
                if source.lastPathComponent == "2026.10.24-1010" { throw POSIXError(.EIO) }
                try CallsDisk.system.rename(source, target)
            }
            let sut = Calls(folder: root, timeZone: utc, duration: { _ in 60 }, transcript: { _ in [] }, disk: disk)
            #expect(throws: CallsFailure.mergeFailed(step: .movingPart(folder: "2026.10.24-1010"), reason: POSIXError(.EIO).localizedDescription)) {
                try sut.merge(ids: ["2026.10.24-1000", "2026.10.24-1010"]) { folder in
                    try Data("joined".utf8).write(to: folder.appendingPathComponent("transcript.md"))
                }
            }
            #expect(try sut.list().map(\.id) == ["2026.10.24-1010", "2026.10.24-1000"])
            #expect(try names(root) == ["2026.10.24-1000", "2026.10.24-1010"])
            #expect(try files(root) == before)
        }
    }

    @Test func aMergeFailingToWriteTheTranscriptLeavesTheParts() throws {
        try withRoot { root in
            try call(root, "2026.10.24-1000", seconds: 60)
            try call(root, "2026.10.24-1010", seconds: 60)
            let before = try files(root)
            let sut = sut(root, lengths: ["2026.10.24-1000": 60, "2026.10.24-1010": 60])
            #expect(throws: CallsFailure.mergeFailed(step: .writingTranscript, reason: POSIXError(.ENOSPC).localizedDescription)) {
                try sut.merge(ids: ["2026.10.24-1000", "2026.10.24-1010"]) { _ in throw POSIXError(.ENOSPC) }
            }
            #expect(try names(root) == ["2026.10.24-1000", "2026.10.24-1010"])
            #expect(try files(root) == before)
        }
    }

    @Test func S10_aPartWithoutAKnownLengthIsNotMerged() throws {
        try withRoot { root in
            try call(root, "2026.10.24-1000", seconds: 60)
            try call(root, "2026.10.24-1010", seconds: 60)
            let before = try files(root)
            var wrote = false
            let sut = sut(root, lengths: ["2026.10.24-1000": 60])
            #expect(throws: CallsFailure.unknownLength(id: "2026.10.24-1010")) {
                try sut.merge(ids: ["2026.10.24-1000", "2026.10.24-1010"]) { _ in wrote = true }
            }
            #expect(!wrote)
            #expect(try names(root) == ["2026.10.24-1000", "2026.10.24-1010"])
            #expect(try files(root) == before)
        }
    }

    @Test func S11_anUnreadableTranscriptNamesItsCall() throws {
        try withRoot { root in
            try call(root, "2026.10.24-1010", seconds: 60)
            let before = try files(root)
            let sut = sut(root, lengths: [:])
            #expect(throws: CallsFailure.unreadableTranscript(id: "2026.10.24-1010", reason: CocoaError(.fileReadNoSuchFile).localizedDescription)) {
                try sut.savedTranscript(id: "2026.10.24-1010")
            }
            #expect(try files(root) == before)
        }
    }
}

private let utc = TimeZone(identifier: "UTC")!

private func sut(_ root: URL, lengths: [String: TimeInterval]) -> Calls {
    Calls(folder: root, timeZone: utc, duration: { url in
        guard let length = lengths[url.deletingLastPathComponent().lastPathComponent] else { throw POSIXError(.EIO) }
        return length
    }, transcript: { _ in [] }, disk: .system)
}

private func folder(_ parent: URL, _ name: String) throws -> URL {
    let url = parent.appendingPathComponent(name, isDirectory: true)
    try FileManager.default.createDirectory(at: url, withIntermediateDirectories: true)
    return url
}

/// A call folder with both tracks; their length comes from the fake reader.
private func call(_ parent: URL, _ name: String, seconds: TimeInterval, transcript: String? = nil) throws {
    let url = try folder(parent, name)
    for track in ["microphone.caf", "call.caf"] { try Data(name.utf8).write(to: url.appendingPathComponent(track)) }
    if let transcript { try Data(transcript.utf8).write(to: url.appendingPathComponent("transcript.md")) }
}

private func names(_ url: URL) throws -> [String] { try FileManager.default.contentsOfDirectory(atPath: url.path).sorted() }

/// Every file under `root`, by its path from `root`, with its bytes.
private func files(_ root: URL) throws -> [String: Data] {
    var result: [String: Data] = [:]
    let base = root.resolvingSymlinksInPath().path + "/"
    for case let url as URL in FileManager.default.enumerator(at: root, includingPropertiesForKeys: nil)! {
        let resolved = url.resolvingSymlinksInPath()
        guard (try resolved.resourceValues(forKeys: [.isDirectoryKey])).isDirectory == false else { continue }
        result[String(resolved.path.dropFirst(base.count))] = try Data(contentsOf: resolved)
    }
    return result
}

private func withRoot(_ body: (URL) throws -> Void) throws {
    let root = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString, isDirectory: true)
    try FileManager.default.createDirectory(at: root, withIntermediateDirectories: true)
    defer { try? FileManager.default.removeItem(at: root) }
    try body(root)
}
