import Foundation
import Synchronization
import Testing
@testable import Calls

/// Transcript transactions against real temp folders; faults come from the disk binding.
@Suite(.timeLimit(.minutes(1)))
struct CallsPreviousTranscriptTests {
    @Test func S1_publishingKeepsTheOldTranscriptBeside() throws {
        try withCall(previous: nil) { root, call in
            let calls = adapter(root)
            try publish(calls)
            try expectPair(calls, call, current: new, previous: old)
            #expect(try names(call) == ["notes.md", previousName, "transcript.md"])
        }
    }

    @Test func S2_publishingDropsAnOlderPrevious() throws {
        try withCall { root, call in
            let calls = adapter(root)
            try publish(calls)
            try expectPair(calls, call, current: new, previous: old)
            #expect(try names(call) == ["notes.md", previousName, "transcript.md"])
            #expect(try names(root) == [call.lastPathComponent])
        }
    }

    @Test func S3_aFailedPublishLeavesThePair() throws {
        try failuresLeavePair(restoring: false)
    }

    @Test func S4_anInterruptedPublishIsSettledAtStart() throws {
        try interruptionsSettle(restoring: false)
    }

    @Test func S5_restoringSwapsTheTwo() throws {
        try withCall { root, call in
            let calls = adapter(root)
            try calls.restorePreviousTranscript(id: id)
            try expectPair(calls, call, current: older, previous: old)
            try calls.restorePreviousTranscript(id: id)
            try expectPair(calls, call, current: old, previous: older)
        }
    }

    @Test func S6_aFailedRestoreLeavesThePair() throws {
        try failuresLeavePair(restoring: true)
    }

    @Test func S7_restoringWithoutAPreviousIsRefused() throws {
        try withCall(previous: nil) { root, _ in
            let before = try files(root)
            #expect(throws: Calls.TranscriptFailure.noPrevious(id: id)) {
                try adapter(root).restorePreviousTranscript(id: id)
            }
            #expect(try files(root) == before)
            #expect(try names(root) == [callName])
        }
    }

    @Test func S8_aListingTellsThePreviousTranscript() throws {
        try withCall { root, call in
            let without = root.appendingPathComponent("2026.10.24-1010 Other", isDirectory: true)
            try FileManager.default.createDirectory(at: without, withIntermediateDirectories: false)
            // A nested previous belongs only to its original call.
            let part = call.appendingPathComponent("2026.10.24-0900", isDirectory: true)
            try FileManager.default.createDirectory(at: part, withIntermediateDirectories: false)
            try older.write(to: part.appendingPathComponent(previousName))
            let listed = try adapter(root).list()
            #expect(listed.map(\.id) == ["2026.10.24-1010", id])
            #expect(listed.map(\.hasPreviousTranscript) == [false, true])
            try FileManager.default.removeItem(at: call.appendingPathComponent(previousName))
            #expect(try adapter(root).list().allSatisfy { !$0.hasPreviousTranscript })
        }
    }

    @Test func S9_aListingTellsMissingTracks() throws {
        try withCall { root, call in
            let originals: [(String, [Calls.Track])] = [
                ("2026.10.24-1000", [.microphone, .call]),
                ("2026.10.24-1010", [.microphone]),
                ("2026.10.24-1020", []),
                ("2026.10.24-1030", [.call])
            ]
            let nested = call.appendingPathComponent("2026.10.24-1010 Nested", isDirectory: true)
            try FileManager.default.createDirectory(at: nested, withIntermediateDirectories: true)
            for (index, original) in originals.enumerated() {
                let parent = index == 0 ? call : nested
                let part = parent.appendingPathComponent(original.0 + " Original", isDirectory: true)
                try FileManager.default.createDirectory(at: part, withIntermediateDirectories: false)
                for track in original.1 {
                    try Data().write(to: part.appendingPathComponent(track.rawValue + ".caf"))
                }
            }
            // An original's own track stops traversal, even with named folders inside.
            let ignored = call.appendingPathComponent("2026.10.24-1000 Original/2026.10.24-0900")
            try FileManager.default.createDirectory(at: ignored, withIntermediateDirectories: false)
            let calls = adapter(root)
            let listing = try calls.list()
            #expect(listing.count == 1)
            let listed = try #require(listing.first)
            #expect(listed.id == id)
            #expect(listed.duration == nil)
            #expect(listed.missingTracks == [
                .init(id: "2026.10.24-1010", track: .call),
                .init(id: "2026.10.24-1020", track: .microphone),
                .init(id: "2026.10.24-1020", track: .call),
                .init(id: "2026.10.24-1030", track: .microphone)
            ])
            try Data().write(to: call.appendingPathComponent("call.caf"))
            #expect(try calls.list().first?.missingTracks == [.init(id: id, track: .microphone)])
            try Data().write(to: call.appendingPathComponent("microphone.caf"))
            #expect(try calls.list().first?.missingTracks == [])
        }
    }

    @Test func S10_theTranscriptsIdentityFollowsItsBytes() throws {
        try withCall { root, _ in
            let calls = adapter(root)
            let first = try #require(calls.text(id: id).identity)
            // Both byte sequences decode to the same text, so hashing decoded text loses identity.
            let changed = Data([0xfe]) + old.dropFirst()
            #expect(String(decoding: old, as: UTF8.self) == String(decoding: changed, as: UTF8.self))
            try calls.publishTranscript(id: id) { try changed.write(to: $0) }
            let second = try #require(calls.text(id: id).identity)
            #expect(second != first)
            #expect(try calls.text(id: id).identity == second)
            try calls.publishTranscript(id: id) { try changed.write(to: $0) }
            #expect(try calls.text(id: id).identity == second)
            try calls.rename(id: id, title: "Renamed")
            #expect(try calls.text(id: id).identity == second)
        }
    }

    @Test func transcriptIdentityHashesTheSingleReadHandedToTheReader() throws {
        try withCall { root, call in
            let bytes = Data("abc".utf8)
            let reads = Mutex<[URL]>([])
            let parsed = Mutex<[String]>([])
            let lines = [Calls.Text.Line(start: 3, words: "reader's answer", label: "A")]
            var disk = CallsDisk.system
            disk.read = { url in
                reads.withLock { $0.append(url) }
                return bytes
            }
            let calls = Calls(folder: root, timeZone: TimeZone(secondsFromGMT: 0)!, duration: { _ in 60 },
                              transcript: { text in parsed.withLock { $0.append(text) }; return lines }, disk: disk)
            let text = try calls.text(id: id)
            #expect(text == .init(transcript: lines, identity: "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"))
            #expect(reads.withLock { $0.map { $0.resolvingSymlinksInPath() } }
                    == [call.appendingPathComponent("transcript.md").resolvingSymlinksInPath()])
            #expect(parsed.withLock { $0 } == ["abc"])
            try Data().write(to: call.appendingPathComponent("transcript.md"))
            #expect(try adapter(root).text(id: id).identity == "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855")
            try FileManager.default.removeItem(at: call.appendingPathComponent("transcript.md"))
            #expect(try adapter(root).text(id: id) == .init(transcript: [], identity: nil))
        }
    }

    @Test func S11_aMergedCallsPartsAreUntouched() throws {
        try withCall { root, call in
            let part = call.appendingPathComponent("2026.10.24-0900", isDirectory: true)
            let nested = part.appendingPathComponent("2026.10.24-0800", isDirectory: true)
            try FileManager.default.createDirectory(at: nested, withIntermediateDirectories: true)
            for folder in [part, nested] {
                for name in ["transcript.md", previousName, "call.caf", "microphone.caf", "notes.md"] {
                    try Data((folder.lastPathComponent + name).utf8).write(to: folder.appendingPathComponent(name))
                }
            }
            let before = try files(part)
            try publish(adapter(root))
            #expect(try files(part) == before)
            try adapter(root).restorePreviousTranscript(id: id)
            #expect(try files(part) == before)
        }
    }

    @Test func S12_anInterruptedRestoreIsSettledAtStart() throws {
        try interruptionsSettle(restoring: true)
    }

    @Test func S13_restoringBringsBackTheIdentity() throws {
        try withCall { root, _ in
            let calls = adapter(root)
            let first = try #require(calls.text(id: id).identity)
            try publish(calls)
            let second = try #require(calls.text(id: id).identity)
            #expect(second != first)
            try calls.restorePreviousTranscript(id: id)
            #expect(try calls.text(id: id).identity == first)
            try calls.restorePreviousTranscript(id: id)
            #expect(try calls.text(id: id).identity == second)
        }
    }

    @Test(arguments: [false, true])
    func S14_aReadDuringAChangeFindsAWholePair(restoring: Bool) async throws {
        // Zero holds the publish writer; the other points hold after each pair rename.
        for point in (restoring ? 1 : 0)...4 {
            let (root, call) = try makeCall(previous: older)
            defer { try? FileManager.default.removeItem(at: root) }
            let hold = HeldChange()
            defer { hold.release() }
            let moves = Mutex(0)
            let pairs = Mutex<[[Data?]]>([])
            let readBeforeRelease = Mutex(false)
            let attempted = AsyncStream<Void>.makeStream()
            var disk = CallsDisk.system
            disk.rename = { source, target in
                try CallsDisk.system.rename(source, target)
                let move = moves.withLock { $0 += 1; return $0 }
                if move == point { hold.wait() }
            }
            disk.read = { url in
                let duringChange = hold.hasStarted
                if duringChange && !hold.isReleased { readBeforeRelease.withLock { $0 = true } }
                let data = try CallsDisk.system.read(url)
                if duringChange && url.lastPathComponent == "transcript.md" {
                    let previous = try CallsDisk.system.read(call.appendingPathComponent(previousName))
                    pairs.withLock { $0.append([data, previous]) }
                }
                return data
            }
            let calls = adapter(root, disk: disk)
            let changing = Task {
                try await concurrentTranscriptOperation {
                    defer { hold.started.continuation.finish() }
                    if restoring { try calls.restorePreviousTranscript(id: id) }
                    else {
                        try calls.publishTranscript(id: id) { url in
                            try new.write(to: url, options: .withoutOverwriting)
                            if point == 0 { hold.wait() }
                        }
                    }
                }
            }
            var started = hold.started.stream.makeAsyncIterator()
            let didStart: Void? = await started.next()
            let reading = Task {
                try await concurrentTranscriptOperation {
                    attempted.continuation.finish()
                    let text = try calls.text(id: id)
                    let bytes = try calls.savedTranscript(id: id)
                    let listed = try calls.list()
                    return (text, bytes, listed)
                }
            }
            for await _ in attempted.stream {}
            hold.release()
            // Both operations are reaped before any throwing assertion or fixture cleanup.
            let changed = await changing.result
            let read = await reading.result
            try changed.get()
            let (text, bytes, listed) = try read.get()
            #expect(didStart != nil)
            #expect(!readBeforeRelease.withLock { $0 })
            let expected = restoring ? older : new
            #expect(bytes == expected)
            #expect(text == (try adapter(root).text(id: id)))
            #expect(listed.map(\.hasPreviousTranscript) == [true])
            #expect(pairs.withLock { $0 } == [[expected, old], [expected, old]])
        }
    }

    @Test func interruptedRollbackCanBeRestarted() throws {
        for restoring in [false, true] {
            for previous in [nil, older] where !restoring || previous != nil {
                let steps = try mutationCount(restoring: restoring, previous: previous)
                // The last rename commits; deletion after it is best-effort cleanup.
                for step in 2..<(steps - 1) {
                    try withCall(previous: previous) { root, call in
                        let fault = Faults(failBefore: step, interruptRollback: true)
                        #expect(throws: (any Error).self) { try change(adapter(root, disk: fault.disk()), restoring: restoring, fault: fault) }
                        try adapter(root).recoverInterruptedMerges()
                        try expectPair(adapter(root), call, current: old, previous: previous)
                        #expect(try names(root) == [callName])
                    }
                }
            }
        }
    }

    @Test func interruptedMergeWithATranscriptsFolderRestoresItsParts() throws {
        try withCall { root, call in
            let before = try files(root)
            let prepared = root.appendingPathComponent(".audelin-merge-interrupted", isDirectory: true)
            try FileManager.default.createDirectory(at: prepared.appendingPathComponent("transcripts"), withIntermediateDirectories: true)
            try FileManager.default.moveItem(at: call, to: prepared.appendingPathComponent(call.lastPathComponent))
            try adapter(root).recoverInterruptedMerges()
            #expect(try files(root) == before)
            #expect(try names(root) == [callName])
        }
    }

    @Test func cleanupFailureKeepsTheCommittedPair() throws {
        for restoring in [false, true] {
            try withCall { root, call in
                var disk = CallsDisk.system
                disk.remove = { url in
                    if url.lastPathComponent.hasPrefix(".audelin-settled-") {
                        // Even partial removal cannot make a committed record pending again.
                        if let child = try FileManager.default.contentsOfDirectory(at: url, includingPropertiesForKeys: nil).first {
                            try FileManager.default.removeItem(at: child)
                        }
                        throw POSIXError(.EIO)
                    }
                    try CallsDisk.system.remove(url)
                }
                try change(adapter(root, disk: disk), restoring: restoring)
                try adapter(root).recoverInterruptedMerges()
                try expectPair(adapter(root), call, current: restoring ? older : new, previous: old)
                #expect(try names(root) == [callName])
            }
        }
    }
}

private let id = "2026.10.24-1000"
private let callName = id + " Sync"
private let previousName = "transcript-previous.md"
// Invalid UTF-8 and mixed line endings prove these are bytes, never parsed or rendered.
private let old = Data([0xff, 0x00]) + Data("# Old\r\n\norigin: retained\r\n".utf8)
private let older = Data("# Older\norigin: unknown\n".utf8)
private let new = Data("# New\norigin: this build\n".utf8)
private let notes = Data("kept notes".utf8)

private func adapter(_ root: URL, disk: CallsDisk = .system) -> Calls {
    Calls(folder: root, timeZone: TimeZone(secondsFromGMT: 0)!, duration: { _ in 60 },
          transcript: { _ in [] }, disk: disk)
}

private func publish(_ calls: Calls, fault: Faults? = nil) throws {
    try calls.publishTranscript(id: id) { url in
        if let fault { try fault.mutate { try new.write(to: url, options: .withoutOverwriting) } }
        else { try new.write(to: url, options: .withoutOverwriting) }
    }
}

private func change(_ calls: Calls, restoring: Bool, fault: Faults? = nil) throws {
    if restoring { try calls.restorePreviousTranscript(id: id) }
    else { try publish(calls, fault: fault) }
}

private func expectPair(_ calls: Calls, _ call: URL, current: Data, previous: Data?) throws {
    #expect(try calls.savedTranscript(id: id) == current)
    #expect(try CallsDisk.system.read(call.appendingPathComponent(previousName)) == previous)
    #expect(try Data(contentsOf: call.appendingPathComponent("notes.md")) == notes)
}

private func failuresLeavePair(restoring: Bool) throws {
    for previous in [nil, older] where !restoring || previous != nil {
        let steps = try mutationCount(restoring: restoring, previous: previous)
        for step in 1..<steps {
            try withCall(previous: previous) { root, _ in
                let before = try files(root)
                let fault = Faults(failBefore: step)
                let calls = adapter(root, disk: fault.disk())
                #expect(throws: (any Error).self) { try change(calls, restoring: restoring, fault: fault) }
                #expect(try files(root) == before)
                #expect(try names(root) == [callName])
            }
        }
    }
    // The caller receives the underlying failure reason after a file has moved.
    try withCall { root, _ in
        var disk = CallsDisk.system
        disk.rename = { source, target in
            if source.lastPathComponent == previousName { throw POSIXError(.ENOSPC) }
            try CallsDisk.system.rename(source, target)
        }
        #expect(throws: Calls.TranscriptFailure.changeFailed(id: id, reason: POSIXError(.ENOSPC).localizedDescription)) {
            try change(adapter(root, disk: disk), restoring: restoring)
        }
    }
}

private func interruptionsSettle(restoring: Bool) throws {
    for previous in [nil, older] where !restoring || previous != nil {
        let steps = try mutationCount(restoring: restoring, previous: previous)
        for step in 1...steps {
            try withCall(previous: previous) { root, call in
                let fault = Faults(interruptAfter: step)
                try? change(adapter(root, disk: fault.disk()), restoring: restoring, fault: fault)
                let restarted = adapter(root)
                try restarted.recoverInterruptedMerges()
                let pair = [try restarted.savedTranscript(id: id), try CallsDisk.system.read(call.appendingPathComponent(previousName))]
                #expect(pair == [old, previous] || pair == [restoring ? older : new, old])
                #expect(try names(root) == [callName])
                #expect(try names(call) == (previous == nil && pair == [old, nil]
                        ? ["notes.md", "transcript.md"] : ["notes.md", previousName, "transcript.md"]))
                #expect(try Data(contentsOf: call.appendingPathComponent("notes.md")) == notes)
                try restarted.recoverInterruptedMerges()
                #expect(try restarted.list().count == 1)
            }
        }
    }
}

private func mutationCount(restoring: Bool, previous: Data?) throws -> Int {
    try withCall(previous: previous) { root, _ in
        let fault = Faults()
        try change(adapter(root, disk: fault.disk()), restoring: restoring, fault: fault)
        return fault.count
    }
}

/// A one-shot failure permits rollback; an interruption makes the binding unavailable
/// thereafter, including during rollback, until a new adapter opens the folder.
private final class Faults: Sendable {
    private struct State { var count = 0; var unavailable = false; var failed = false }
    private let state = Mutex(State())
    private let failBefore: Int?
    private let interruptAfter: Int?
    private let interruptRollback: Bool
    init(failBefore: Int? = nil, interruptAfter: Int? = nil, interruptRollback: Bool = false) {
        self.failBefore = failBefore; self.interruptAfter = interruptAfter; self.interruptRollback = interruptRollback
    }
    var count: Int { state.withLock { $0.count } }
    func check() throws { if state.withLock({ $0.unavailable }) { throw POSIXError(.EIO) } }
    func mutate(_ body: () throws -> Void) throws {
        try check()
        let fail = state.withLock { state in
            state.count += 1
            if state.count == failBefore {
                state.failed = true
                return true
            }
            if state.failed && interruptRollback { state.unavailable = true; return true }
            return false
        }
        if fail { throw POSIXError(.EIO) }
        try body()
        let interrupt = state.withLock { state in
            if state.count == interruptAfter { state.unavailable = true; return true }
            return false
        }
        if interrupt { throw POSIXError(.EIO) }
    }
    func disk() -> CallsDisk {
        var disk = CallsDisk.system
        disk.children = { try self.check(); return try CallsDisk.system.children($0) }
        disk.values = { try self.check(); return try CallsDisk.system.values($0) }
        disk.read = { try self.check(); return try CallsDisk.system.read($0) }
        disk.makeFolder = { url in try self.mutate { try CallsDisk.system.makeFolder(url) } }
        disk.rename = { source, target in try self.mutate { try CallsDisk.system.rename(source, target) } }
        disk.copy = { source, target in try self.mutate { try CallsDisk.system.copy(source, target) } }
        disk.remove = { url in try self.mutate { try CallsDisk.system.remove(url) } }
        return disk
    }
}

private func names(_ url: URL) throws -> [String] { try FileManager.default.contentsOfDirectory(atPath: url.path).sorted() }
private func files(_ root: URL) throws -> [String: Data] {
    var result: [String: Data] = [:]
    let base = root.path + "/"
    for case let url as URL in FileManager.default.enumerator(at: root, includingPropertiesForKeys: [.isRegularFileKey])! {
        if try url.resourceValues(forKeys: [.isRegularFileKey]).isRegularFile == true {
            result[String(url.path.dropFirst(base.count))] = try Data(contentsOf: url)
        }
    }
    return result
}
private func makeCall(previous: Data?) throws -> (URL, URL) {
    let root = FileManager.default.temporaryDirectory.resolvingSymlinksInPath().appendingPathComponent(UUID().uuidString, isDirectory: true)
    let call = root.appendingPathComponent(callName, isDirectory: true)
    try FileManager.default.createDirectory(at: call, withIntermediateDirectories: true)
    do {
        try old.write(to: call.appendingPathComponent("transcript.md"))
        try previous?.write(to: call.appendingPathComponent(previousName))
        try notes.write(to: call.appendingPathComponent("notes.md"))
    } catch {
        try? FileManager.default.removeItem(at: root)
        throw error
    }
    return (root, call)
}
private func withCall<T>(previous: Data? = older, _ body: (URL, URL) throws -> T) throws -> T {
    let (root, call) = try makeCall(previous: previous)
    defer { try? FileManager.default.removeItem(at: root) }
    return try body(root, call)
}

/// Competing synchronous disk callers can wait on one another, outside the cooperative pool.
private func concurrentTranscriptOperation<Value: Sendable>(
    _ body: @escaping @Sendable () throws -> Value
) async throws -> Value {
    try await withCheckedThrowingContinuation { done in
        Thread { done.resume(with: Result { try body() }) }.start()
    }
}

private final class HeldChange: @unchecked Sendable {
    let started = AsyncStream<Void>.makeStream()
    private let condition = NSCondition()
    private var held = false
    private var released = false

    var hasStarted: Bool {
        condition.lock(); defer { condition.unlock() }
        return held
    }
    var isReleased: Bool {
        condition.lock(); defer { condition.unlock() }
        return released
    }
    func wait() {
        condition.lock(); defer { condition.unlock() }
        held = true
        started.continuation.yield(())
        while !released { condition.wait() }
    }
    func release() {
        condition.lock(); defer { condition.unlock() }
        released = true
        condition.broadcast()
    }
}
