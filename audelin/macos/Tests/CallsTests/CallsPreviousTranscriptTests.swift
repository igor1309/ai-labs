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
private func withCall<T>(previous: Data? = older, _ body: (URL, URL) throws -> T) throws -> T {
    let root = FileManager.default.temporaryDirectory.resolvingSymlinksInPath().appendingPathComponent(UUID().uuidString, isDirectory: true)
    let call = root.appendingPathComponent(callName, isDirectory: true)
    try FileManager.default.createDirectory(at: call, withIntermediateDirectories: true)
    defer { try? FileManager.default.removeItem(at: root) }
    try old.write(to: call.appendingPathComponent("transcript.md"))
    try previous?.write(to: call.appendingPathComponent(previousName))
    try notes.write(to: call.appendingPathComponent("notes.md"))
    return try body(root, call)
}
