import Foundation
import Testing
import Calls

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
private func call(_ parent: URL, _ name: String, seconds: TimeInterval) throws {
    let url = try folder(parent, name)
    for track in ["microphone.caf", "call.caf"] { try Data().write(to: url.appendingPathComponent(track)) }
}

private func withRoot(_ body: (URL) throws -> Void) throws {
    let root = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString, isDirectory: true)
    try FileManager.default.createDirectory(at: root, withIntermediateDirectories: true)
    defer { try? FileManager.default.removeItem(at: root) }
    try body(root)
}
