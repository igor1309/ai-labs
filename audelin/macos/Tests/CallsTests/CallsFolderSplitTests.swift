import Foundation
import Testing
@testable import Calls

@Suite(.timeLimit(.minutes(1)))
struct CallsFolderSplitTests {
    private let id = "1970.01.01-0000"
    private let secondID = "1970.01.01-0001"
    private let start = Date(timeIntervalSince1970: 0)

    @Test func publishesBothPreparedPartsAndPlacesNestedRecordings() throws {
        try withRoot { root in
            let original = try fixture(in: root)
            let calls = calls(in: root)
            let result = try split(calls) { first, second in
                #expect(try calls.list().map(\.id) == [id])
                #expect(try calls.savedTranscript(id: id) == Data("original".utf8))
                try writeParts(first, second)
            }

            #expect(result == .init(first: id, second: secondID))
            let listed = try calls.list()
            #expect(listed.map(\.title) == ["Later", "Earlier"])
            #expect(listed.map(\.duration) == [70, 70])
            #expect(listed.first?.start == start.addingTimeInterval(60))
            #expect(!FileManager.default.fileExists(atPath: original.path))
            try expectParts(in: calls)

            try expectRecordings(in: calls)
        }
    }

    @Test(arguments: [false, true])
    func aRejectedDestinationNameLeavesTheOriginalReadable(overlongSecondTitle: Bool) throws {
        try withRoot { root in
            _ = try fixture(in: root)
            let before = try contents(root)
            let title = String(repeating: "long title ", count: 80)
            let first = overlongSecondTitle ? "Earlier" : title
            let second = overlongSecondTitle ? title : "Later"
            #expect(throws: CallsFailure.invalidTitle) {
                try split(calls(in: root), firstTitle: first, secondTitle: second, write: writeParts)
            }
            let reopened = calls(in: root)
            try reopened.recoverInterruptedMerges()
            #expect(try reopened.list().map(\.id) == [id])
            #expect(try reopened.savedTranscript(id: id) == Data("original".utf8))
            #expect(try contents(root) == before)
        }
    }

    @Test(arguments: ["writer", "cutter", "decision"])
    func failureBeforeTheDecisionLeavesTheOriginalByteForByte(at step: String) throws {
        try withRoot { root in
            _ = try fixture(in: root)
            let before = try contents(root)
            var disk = CallsDisk.system
            disk.makeFolder = { url in
                if step == "decision", url.lastPathComponent == "committed" { throw POSIXError(.EIO) }
                try CallsDisk.system.makeFolder(url)
            }
            let calls = calls(in: root, disk: disk)
            #expect(throws: POSIXError(.EIO)) {
                try split(calls, cut: { offset, source, first, second in
                    try cutTrack(offset, source, first, second)
                    if step == "cutter" { throw POSIXError(.EIO) }
                }) { first, second in
                    try writeParts(first, second)
                    if step == "writer" { throw POSIXError(.EIO) }
                }
            }
            #expect(try calls.list().map(\.id) == [id])
            #expect(try contents(root) == before)
        }
    }

    @Test(arguments: [false, true])
    func recoversTheOriginalBeforeCommit(relocated: Bool) throws {
        try withRoot { root in
            _ = try fixture(in: root)
            let before = try contents(root)
            var disk = CallsDisk.system
            disk.rename = { source, target in
                if !relocated, ["first", "second"].contains(target.deletingLastPathComponent().lastPathComponent) {
                    throw POSIXError(.EIO)
                }
                if source.lastPathComponent == "original",
                   source.deletingLastPathComponent().lastPathComponent.hasPrefix(".audelin-split-") { throw POSIXError(.EIO) }
                if relocated, source.deletingLastPathComponent().lastPathComponent == "second" { throw POSIXError(.EIO) }
                try CallsDisk.system.rename(source, target)
            }
            disk.makeFolder = { url in
                if url.lastPathComponent == "committed" { throw POSIXError(.EIO) }
                try CallsDisk.system.makeFolder(url)
            }
            let interrupted = calls(in: root, disk: disk)
            #expect(throws: Calls.SplitFailure.recoveryRequired(reason: POSIXError(.EIO).localizedDescription)) {
                try split(interrupted, write: writeParts)
            }

            let reopened = calls(in: root)
            for _ in 0..<2 {
                try reopened.recoverInterruptedMerges()
                #expect(try reopened.list().map(\.id) == [id])
                #expect(try contents(root) == before)
            }
        }
    }

    @Test(arguments: [false, true])
    func recoversBothPartsAfterOnlyOneWasPublished(titleChanged: Bool) throws {
        try withRoot { root in
            _ = try fixture(in: root)
            var disk = CallsDisk.system
            disk.rename = { source, target in
                if source.lastPathComponent == "second", source.deletingLastPathComponent().lastPathComponent.hasPrefix(".audelin-split-") {
                    throw POSIXError(.EIO)
                }
                try CallsDisk.system.rename(source, target)
            }
            let interrupted = calls(in: root, disk: disk)
            let replacement = Calls.SplitReplacement(first: id, second: secondID)
            #expect(throws: Calls.SplitFailure.committed(replacement, reason: POSIXError(.EIO).localizedDescription)) {
                try split(interrupted, write: writeParts)
            }
            #expect(FileManager.default.fileExists(atPath: root.appendingPathComponent(id + " Earlier").path))
            #expect(!FileManager.default.fileExists(atPath: root.appendingPathComponent(secondID + " Later").path))
            #expect(throws: Calls.SplitFailure.self) { try interrupted.list() }
            #expect(throws: Calls.SplitFailure.self) { try interrupted.location(id: id) }
            let firstName = id + (titleChanged ? " Renamed" : " Earlier")
            if titleChanged {
                try FileManager.default.moveItem(at: root.appendingPathComponent(id + " Earlier"),
                                                 to: root.appendingPathComponent(firstName))
            }
            let reopened = calls(in: root)
            var registrations: [Calls.SplitReplacement] = []
            for _ in 0..<2 {
                try reopened.recoverInterruptedMerges { registrations.append($0) }
                #expect(try reopened.list().map(\.id) == [secondID, id])
                try expectParts(in: reopened)
                try expectRecordings(in: reopened)
                #expect(try FileManager.default.contentsOfDirectory(atPath: root.path).sorted() == [firstName, secondID + " Later"])
            }
            #expect(registrations == [replacement])
        }
    }

    @Test func aTranscriptThatChangesDuringPreparationRemainsCurrent() throws {
        try withRoot { root in
            let original = try fixture(in: root)
            let calls = calls(in: root)
            #expect(throws: Calls.SplitFailure.expiredTranscript(id: id)) {
                try split(calls) { first, second in
                    try writeParts(first, second)
                    try write("changed", "transcript.md", in: original)
                }
            }
            #expect(try calls.savedTranscript(id: id) == Data("changed".utf8))
            #expect(try FileManager.default.contentsOfDirectory(atPath: root.path) == [id + " Original"])
        }
    }

    @Test(arguments: [false, true])
    func cancellationSettlesOnTheSideOfTheDecisionItReached(committed: Bool) async throws {
        try await Task {
            try withRoot { root in
                _ = try fixture(in: root)
                let before = try contents(root)
                var disk = CallsDisk.system
                disk.rename = { source, target in
                    try CallsDisk.system.rename(source, target)
                    if !committed, target.lastPathComponent == "original" {
                        withUnsafeCurrentTask { $0?.cancel() }
                    }
                }
                disk.makeFolder = { url in
                    try CallsDisk.system.makeFolder(url)
                    if committed, url.lastPathComponent == "committed" {
                        withUnsafeCurrentTask { $0?.cancel() }
                    }
                }
                let calls = calls(in: root, disk: disk)
                if committed {
                    #expect(try split(calls, write: writeParts) == .init(first: id, second: secondID))
                    try expectParts(in: calls)
                } else {
                    #expect(throws: CancellationError.self) { try split(calls, write: writeParts) }
                    #expect(try calls.list().map(\.id) == [id])
                    #expect(try contents(root) == before)
                }
                #expect(Task.isCancelled)
            }
        }.value
    }

    @Test func anUncutTopLevelRecordingIsKeptWholeWhenOnePartHasNoAudio() throws {
        try withRoot { root in
            let original = try makeFolder(id, in: root)
            try write("original", "transcript.md", in: original)
            try write("whole first", "call.caf", in: original)
            let calls = calls(in: root)
            let transcript = try calls.splitTranscript(id: id)
            let parts = try calls.split(id: id, expectedTranscript: transcript.identity, firstTitle: "Earlier",
                                        secondTitle: "Later", plan: { source in
                .init(firstStart: start, secondStart: start.addingTimeInterval(60),
                      recordings: [.whole(folder: source.folder, side: .first)], write: writeParts)
            }, cut: { _, _, _, _ in Issue.record("whole recording reached the cutter") })

            #expect(try calls.list().map(\.duration) == [0, 20])
            let leaf = try #require(try calls.originals(id: parts.first).first)
            #expect(try read(leaf.callTrack) == "whole first")
            #expect(try calls.originals(id: parts.second).isEmpty)
            #expect(try calls.merge(ids: [parts.second, parts.first]) { _, _ in } == parts.first)
        }
    }

    private func split(_ calls: Calls, firstTitle: String = "Earlier", secondTitle: String = "Later",
                       cut: (TimeInterval, URL, URL, URL) throws -> Void = cutTrack,
                       write: @escaping (URL, URL) throws -> Void) throws -> Calls.SplitReplacement {
        let transcript = try calls.splitTranscript(id: id)
        return try calls.split(id: id, expectedTranscript: transcript.identity, firstTitle: firstTitle, secondTitle: secondTitle, plan: { source in
            #expect(source.transcript == transcript.bytes)
            let placements = source.recordings.map { leaf -> Calls.SplitRecording in
                let folder = leaf.callTrack.deletingLastPathComponent()
                switch leaf.id {
                case id: return .whole(folder: folder, side: .first)
                case secondID: return .cut(folder: folder, offset: 10)
                default: return .whole(folder: folder, side: .second)
                }
            }
            return .init(firstStart: start, secondStart: start.addingTimeInterval(70), recordings: placements, write: write)
        }, cut: cut)
    }

    private func calls(in root: URL, disk: CallsDisk = .system) -> Calls {
        Calls(folder: root, timeZone: .gmt, duration: { url in
            switch try read(url) {
            case "whole first": return 20
            case "whole second": return 20
            case "before:10.0": return 10
            case "after:10.0": return 30
            default: return 40
            }
        }, transcript: { _ in [] }, disk: disk)
    }

    private func fixture(in root: URL) throws -> URL {
        let original = try makeFolder(id + " Original", in: root)
        try write("original", "transcript.md", in: original)
        try write("older", "transcript-previous.md", in: original)
        try write("old job", "notes-job.json", in: original)
        let inner = try makeFolder(id, in: original)
        let first = try makeFolder(id + " First original", in: inner)
        let spanning = try makeFolder(secondID + " Spanning", in: inner)
        let last = try makeFolder("1970.01.01-0002 Last original", in: original)
        try write("whole first", "call.caf", in: first)
        try write("first attachment", "keep", in: first)
        try write("spanning call", "call.caf", in: spanning)
        try write("spanning microphone", "microphone.caf", in: spanning)
        try write("whole second", "call.caf", in: last)
        return original
    }

    private func writeParts(_ first: URL, _ second: URL) throws {
        try write("first transcript", "transcript.md", in: first)
        try write("first job", "notes-job.json", in: first)
        try write("second transcript", "transcript.md", in: second)
        try write("second job", "notes-job.json", in: second)
    }

    private func expectRecordings(in calls: Calls) throws {
        let first = try calls.originals(id: id)
        let second = try calls.originals(id: secondID)
        try #require(first.count == 2 && second.count == 2)
        #expect(first.map(\.start) == [start, start.addingTimeInterval(60)])
        #expect(second.map(\.start) == [start.addingTimeInterval(70), start.addingTimeInterval(120)])
        #expect(try first.map { try read($0.callTrack) } == ["whole first", "before:10.0"])
        #expect(try second.map { try read($0.callTrack) } == ["after:10.0", "whole second"])
        #expect(try read(first[1].microphoneTrack) == "before:10.0")
        #expect(try read(second[0].microphoneTrack) == "after:10.0")
        #expect(try read(first[0].callTrack.deletingLastPathComponent().appendingPathComponent("keep")) == "first attachment")
        #expect(!FileManager.default.fileExists(atPath: second[1].microphoneTrack.path))
        #expect(try calls.part(id: secondID).originalStarts == second.map(\.start))
        #expect(!FileManager.default.fileExists(atPath: first[0].microphoneTrack.path))
    }

    private func expectParts(in calls: Calls) throws {
        for (id, label) in [(id, "first"), (secondID, "second")] {
            let part = try calls.location(id: id)
            #expect(try read(part.appendingPathComponent("transcript.md")) == "\(label) transcript")
            #expect(try read(part.appendingPathComponent("notes-job.json")) == "\(label) job")
            #expect(!FileManager.default.fileExists(atPath: part.appendingPathComponent("transcript-previous.md").path))
        }
    }
}

private func cutTrack(_ offset: TimeInterval, _ source: URL, _ first: URL, _ second: URL) throws {
    #expect(try read(source).hasPrefix("spanning "))
    try Data("before:\(offset)".utf8).write(to: first)
    try Data("after:\(offset)".utf8).write(to: second)
}

private func read(_ url: URL) throws -> String { try String(contentsOf: url, encoding: .utf8) }

private func write(_ text: String, _ name: String, in folder: URL) throws {
    try Data(text.utf8).write(to: folder.appendingPathComponent(name))
}

private func makeFolder(_ name: String, in parent: URL) throws -> URL {
    let url = parent.appendingPathComponent(name, isDirectory: true)
    try FileManager.default.createDirectory(at: url, withIntermediateDirectories: false)
    return url
}

private func contents(_ root: URL) throws -> [String: Data] {
    var snapshot: [String: Data] = [:]
    for name in try FileManager.default.contentsOfDirectory(atPath: root.path) {
        let url = root.appendingPathComponent(name)
        if try url.resourceValues(forKeys: [.isDirectoryKey]).isDirectory == true {
            snapshot[name + "/"] = Data()
            for (child, bytes) in try contents(url) { snapshot[name + "/" + child] = bytes }
        } else {
            snapshot[name] = try Data(contentsOf: url)
        }
    }
    return snapshot
}

private func withRoot(_ body: (URL) throws -> Void) throws {
    let root = try makeFolder(UUID().uuidString, in: FileManager.default.temporaryDirectory)
    defer { try? FileManager.default.removeItem(at: root) }
    try body(root)
}
