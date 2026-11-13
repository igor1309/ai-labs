import BlockingTestWork
import Darwin
import Foundation
import Synchronization
import Testing
@testable import Calls

@Suite(.timeLimit(.minutes(1)))
struct CallsMoveTests {
    @Test func moveKeepsEveryFileAndIdentityAfterAFinderRename() async throws {
        try await withMoveFolders { (source: URL, target: URL) async throws in
            try FileManager.default.moveItem(at: source.appendingPathComponent(name), to: source.appendingPathComponent(id + " Finder"))
            let disk = Calls(folder: source, timeZone: .gmt, duration: { _ in 0 }, transcript: { _ in [] }, disk: .system)
            #expect(try disk.move(id: id, to: target) == 7)
            #expect(try FileManager.default.contentsOfDirectory(atPath: source.path).isEmpty)
            #expect(try FileManager.default.contentsOfDirectory(atPath: target.path) == [id + " Finder"])
            #expect(try Data(contentsOf: target.appendingPathComponent(id + " Finder/nested/two")) == Data([4, 5, 6, 7]))
            #expect(try Data(contentsOf: target.appendingPathComponent(id + " Finder/one")) == Data([1, 2, 3]))
        }
    }

    @Test(arguments: ["copy", "sizes", "read", "missing", "rename", "retire"])
    func failureRestoresTheWholeSourceAndRemovesOnlyItsCopy(step: String) async throws {
        try await withMoveFolders { (source: URL, target: URL) async throws in
            let original = source.appendingPathComponent(name)
            let renames = Mutex(0)
            let verificationReads = Mutex<[String]>([])
            let finalNameVisibleDuringVerification = Mutex<[Bool]>([])
            let readsAtRename = Mutex<[String]>([])
            try Data([99]).write(to: target.appendingPathComponent("unrelated"))
            let disk = Calls(folder: source, timeZone: .gmt,
                duration: { _ in 0 },
                transcript: { _ in [] },
                disk: CallsDisk(
                    children: { try FileManager.default.contentsOfDirectory(at: $0, includingPropertiesForKeys: nil) },
                    values: { url in
                    if url.path.contains("/.audelin-move-") {
                        verificationReads.withLock { $0.append(url.lastPathComponent) }
                        let visible = FileManager.default.fileExists(atPath: target.appendingPathComponent(name).path)
                        finalNameVisibleDuringVerification.withLock { $0.append(visible) }
                    }
                    if step == "read", url.path.contains("/target/"), url.lastPathComponent == "one" { throw POSIXError(.EIO) }
                    return try url.resourceValues(forKeys: [.isDirectoryKey, .isSymbolicLinkKey, .fileSizeKey])
                },
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
                },
                    rename: { from, to in
                    renames.withLock { $0 += 1 }
                    let reads = verificationReads.withLock { $0 }
                    readsAtRename.withLock { $0 = reads }
                    if step == "rename" { throw POSIXError(.EACCES) }
                    if step == "retire", from.lastPathComponent == name,
                       from.deletingLastPathComponent().lastPathComponent == "source" { throw POSIXError(.EACCES) }
                    guard renamex_np(from.path, to.path, UInt32(RENAME_EXCL)) == 0 else { throw POSIXError(.EIO) }
                },
                    trash: { _ in throw POSIXError(.EPERM) },
                    remove: { try FileManager.default.removeItem(at: $0) }))
            await #expect(throws: (any Error).self) { try disk.move(id: id, to: target) }
            #expect(renames.withLock { $0 } == (["copy", "sizes", "read", "missing"].contains(step) ? 0 : step == "retire" ? 2 : 1))
            #expect(finalNameVisibleDuringVerification.withLock { $0.allSatisfy { !$0 } })
            if step != "copy" { #expect(!verificationReads.withLock { $0.isEmpty }) }
            if ["rename", "retire"].contains(step) {
                #expect(readsAtRename.withLock { $0.contains("one") && $0.contains("two") })
            }
            #expect(try FileManager.default.contentsOfDirectory(atPath: source.path) == [name])
            #expect(try Data(contentsOf: original.appendingPathComponent("one")) == Data([1, 2, 3]))
            #expect(try Data(contentsOf: original.appendingPathComponent("nested/two")) == Data([4, 5, 6, 7]))
            #expect(try FileManager.default.contentsOfDirectory(atPath: target.path) == ["unrelated"])
            #expect(try Data(contentsOf: target.appendingPathComponent("unrelated")) == Data([99]))
        }
    }

    @Test(arguments: [Calls.Move.Phase.copying, .publishing, .removingSource])
    func journalFailureBeforeSourceDeletionKeepsTheWholeSource(phase: Calls.Move.Phase) async throws {
        try await withMoveFolders { (source: URL, target: URL) async throws in
            let disk = Calls(folder: source, timeZone: .gmt, duration: { _ in 0 }, transcript: { _ in [] }, disk: .system)
            await #expect(throws: (any Error).self) {
                do {
                    try disk.move(id: id, to: target) { record in
                        if record.phase == phase { throw POSIXError(.ENOSPC) }
                    }
                }
            }
            #expect(try Data(contentsOf: source.appendingPathComponent(name + "/one")) == Data([1, 2, 3]))
            #expect(try Data(contentsOf: source.appendingPathComponent(name + "/nested/two")) == Data([4, 5, 6, 7]))
            #expect(try FileManager.default.contentsOfDirectory(atPath: target.path).isEmpty)
        }
    }

    @Test(arguments: ["add", "remove", "resize"])
    func sourceChangesDuringCopyLeaveTheUpdatedSourceInPlace(change: String) async throws {
        try await withMoveFolders { (source: URL, target: URL) async throws in
            let original = source.appendingPathComponent(name)
            let disk = testCalls(folder: source, copy: { from, to in
                try FileManager.default.copyItem(at: from, to: to)
                switch change {
                case "add": try Data([8]).write(to: original.appendingPathComponent("new"))
                case "remove": try FileManager.default.removeItem(at: original.appendingPathComponent("one"))
                default: try Data([8, 9]).write(to: original.appendingPathComponent("one"))
                }
            })
            await #expect(throws: (any Error).self) { try disk.move(id: id, to: target) }
            #expect(try FileManager.default.contentsOfDirectory(atPath: target.path).isEmpty)
            #expect(try Data(contentsOf: original.appendingPathComponent("nested/two")) == Data([4, 5, 6, 7]))
            if change == "add" {
                #expect(try Data(contentsOf: original.appendingPathComponent("new")) == Data([8]))
                #expect(try Data(contentsOf: original.appendingPathComponent("one")) == Data([1, 2, 3]))
            } else if change == "remove" {
                #expect(!FileManager.default.fileExists(atPath: original.appendingPathComponent("one").path))
            } else {
                #expect(try Data(contentsOf: original.appendingPathComponent("one")) == Data([8, 9]))
            }
        }
    }

    @Test(arguments: ["copy", "verification"])
    func restorationFailureKeepsTheVerifiedOwnerUntilRecovery(step: String) async throws {
        try await withMoveFolders { (source: URL, target: URL) async throws in
            let original = source.appendingPathComponent(name), copied = target.appendingPathComponent(name)
            let move = Calls.Move(source: original, target: copied, temporary: target.appendingPathComponent(".audelin-move-test"), phase: .restoringSource)
            do {
                try FileManager.default.copyItem(at: original, to: copied)
                try FileManager.default.removeItem(at: original.appendingPathComponent("one"))
            }
            let fail = Mutex(true), restored = Mutex(false), saved = Mutex(move)
            let disk = testCalls(folder: source, values: { url in
                if step == "verification", fail.withLock({ $0 }), restored.withLock({ $0 }), url == original {
                    throw POSIXError(.EIO)
                }
                return try url.resourceValues(forKeys: [.isDirectoryKey, .isSymbolicLinkKey, .fileSizeKey])
            }, copy: { from, to in
                if step == "copy", fail.withLock({ $0 }) { throw POSIXError(.EIO) }
                try FileManager.default.copyItem(at: from, to: to)
                restored.withLock { $0 = true }
            })
            await #expect(throws: (any Error).self) {
                try disk.recover(move) { next in saved.withLock { $0 = next } }
            }
            let owner = saved.withLock { $0.owner }
            #expect(try sameMoveDirectory(owner, copied))
            #expect(try Data(contentsOf: copied.appendingPathComponent("one")) == Data([1, 2, 3]))
            #expect(try Data(contentsOf: copied.appendingPathComponent("nested/two")) == Data([4, 5, 6, 7]))
            fail.withLock { $0 = false }
            #expect(try disk.recover(saved.withLock { $0 }) { next in saved.withLock { $0 = next } }.phase == .source)
            #expect(try Data(contentsOf: original.appendingPathComponent("one")) == Data([1, 2, 3]))
            #expect(try Data(contentsOf: original.appendingPathComponent("nested/two")) == Data([4, 5, 6, 7]))
            #expect(try FileManager.default.contentsOfDirectory(atPath: target.path).isEmpty)
        }
    }

    @Test(arguments: [false, true], [false, true])
    func cleanupFailureRestoresTheWholeSourceAndRemovesTheDestination(partial: Bool, restarting: Bool) async throws {
        try await withMoveFolders { (source: URL, target: URL) async throws in
            let fail = Mutex(true), saved = Mutex<Calls.Move?>(nil)
            let disk = testCalls(folder: source, copy: { try FileManager.default.copyItem(at: $0, to: $1) }, remove: { url in
                if fail.withLock({ $0 }), url.lastPathComponent.hasSuffix("-source") {
                    let one = url.appendingPathComponent("one")
                    if partial, FileManager.default.fileExists(atPath: one.path) { try FileManager.default.removeItem(at: one) }
                    throw POSIXError(.EIO)
                }
                try FileManager.default.removeItem(at: url)
            })
            if restarting {
                let interrupted = Calls.Move(source: source.appendingPathComponent(name), target: target.appendingPathComponent(name),
                                             temporary: target.appendingPathComponent(".audelin-move-test"), phase: .removingSource)
                try FileManager.default.copyItem(at: interrupted.source, to: interrupted.target)
                await #expect(throws: POSIXError(.EIO)) {
                    try disk.recover(interrupted) { next in saved.withLock { $0 = next } }
                }
            } else {
                await #expect(throws: POSIXError(.EIO)) {
                    try disk.move(id: id, to: target) { next in saved.withLock { $0 = next } }
                }
            }
            let pending = try #require(saved.withLock { $0 })
            #expect(pending.phase == .removingCopy)
            #expect(try sameMoveDirectory(pending.owner, source.appendingPathComponent(name)))
            #expect(try Data(contentsOf: pending.owner.appendingPathComponent("one")) == Data([1, 2, 3]))
            #expect(try Data(contentsOf: pending.owner.appendingPathComponent("nested/two")) == Data([4, 5, 6, 7]))
            #expect(try FileManager.default.contentsOfDirectory(atPath: target.path).isEmpty)
            fail.withLock { $0 = false }
            #expect(try disk.recover(pending) { next in saved.withLock { $0 = next } }.phase == .source)
            #expect(try FileManager.default.contentsOfDirectory(atPath: source.path) == [name])
            #expect(try disk.move(id: id, to: target) == 7)
            #expect(try FileManager.default.contentsOfDirectory(atPath: source.path).isEmpty)
            #expect(try FileManager.default.contentsOfDirectory(atPath: target.path) == [name])
        }
    }

    @Test func completedCopyRemainsSuccessfulWhenOnlyItsFinalJournalWriteFails() async throws {
        try await withMoveFolders { (source: URL, target: URL) async throws in
            let disk = Calls(folder: source, timeZone: .gmt, duration: { _ in 0 }, transcript: { _ in [] }, disk: .system)
            let durable = Mutex<Calls.Move?>(nil)
            #expect(try {
                try disk.move(id: id, to: target) { move in
                    if move.phase == .destination { throw POSIXError(.ENOSPC) }
                    durable.withLock { $0 = move }
                }
            }() == 7)
            let saved = try #require(durable.withLock { $0 })
            #expect(saved.phase == .removingSource)
            #expect(try FileManager.default.contentsOfDirectory(atPath: source.path).isEmpty)
            #expect(try Data(contentsOf: target.appendingPathComponent(name + "/one")) == Data([1, 2, 3]))
            #expect(try disk.recover(saved, record: { move in durable.withLock { $0 = move } }).phase == .destination)
        }
    }

    @Test func recoveryKeepsTheRecordedRootWhenListingReturnsAnAlias() async throws {
        try await withMoveFolders { (source: URL, target: URL) async throws in
            let original = source.appendingPathComponent(name), copied = target.appendingPathComponent(name)
            let alias = target.deletingLastPathComponent().appendingPathComponent("target-alias")
            do {
                try FileManager.default.copyItem(at: original, to: copied)
                try FileManager.default.createSymbolicLink(at: alias, withDestinationURL: target)
            }
            let disk = testCalls(folder: source, children: { root in
                let entries = try FileManager.default.contentsOfDirectory(at: root, includingPropertiesForKeys: nil)
                return root.lastPathComponent == "target" ? entries.map { alias.appendingPathComponent($0.lastPathComponent) } : entries
            }, copy: { try FileManager.default.copyItem(at: $0, to: $1) })
            let move = Calls.Move(source: original, target: copied, temporary: target.appendingPathComponent(".audelin-move-test"), phase: .removingSource)
            let recovered = try disk.recover(move, record: { _ in })
            #expect(recovered.phase == .destination)
            #expect(recovered.target == copied)
            #expect(recovered.temporary.deletingLastPathComponent() == move.temporary.deletingLastPathComponent())
            #expect(try Data(contentsOf: recovered.owner.appendingPathComponent("one")) == Data([1, 2, 3]))
            #expect(try FileManager.default.contentsOfDirectory(atPath: source.path).isEmpty)
        }
    }

    @Test func destinationListingFailureIsReportedBeforeCopying() async throws {
        try await withMoveFolders { (source: URL, target: URL) async throws in
            let copies = Mutex(0)
            let disk = testCalls(folder: source, children: { root in
                if root.lastPathComponent == "target" { throw POSIXError(.EIO) }
                return try FileManager.default.contentsOfDirectory(at: root, includingPropertiesForKeys: nil)
            }, copy: { from, to in
                copies.withLock { $0 += 1 }
                try FileManager.default.copyItem(at: from, to: to)
            })
            await #expect(throws: POSIXError.self) { try disk.move(id: id, to: target) }
            #expect(copies.withLock { $0 } == 0)
            #expect(try Data(contentsOf: source.appendingPathComponent(name + "/one")) == Data([1, 2, 3]))
            #expect(try FileManager.default.contentsOfDirectory(atPath: target.path).isEmpty)
        }
    }

    @Test(arguments: [1, 2])
    func differentlyNamedCallsWithTheSameIDCannotBecomeAnotherCopy(count: Int) async throws {
        try await withMoveFolders { (source: URL, target: URL) async throws in
            do {
                for number in 1...count {
                    try FileManager.default.createDirectory(at: target.appendingPathComponent(id + " other\(number)"), withIntermediateDirectories: false)
                    try Data([99]).write(to: target.appendingPathComponent(id + " other\(number)/kept"))
                }
            }
            let disk = Calls(folder: source, timeZone: .gmt, duration: { _ in 0 }, transcript: { _ in [] }, disk: .system)
            await #expect(throws: (any Error).self) { try disk.move(id: id, to: target) }
            #expect(try FileManager.default.contentsOfDirectory(atPath: target.path).sorted() == (1...count).map { id + " other\($0)" })
            for number in 1...count {
                #expect(try Data(contentsOf: target.appendingPathComponent(id + " other\(number)/kept")) == Data([99]))
            }
            #expect(try Data(contentsOf: source.appendingPathComponent(name + "/one")) == Data([1, 2, 3]))
        }
    }

    @Test(arguments: ["file", "directory", "link"])
    func occupiedTargetIsNeverOverwritten(kind: String) async throws {
        try await withMoveFolders { (source: URL, target: URL) async throws in
            let occupied = target.appendingPathComponent(name)
            do {
                if kind == "directory" { try FileManager.default.createDirectory(at: occupied, withIntermediateDirectories: false) }
                else if kind == "link" { try FileManager.default.createSymbolicLink(at: occupied, withDestinationURL: source) }
                else { try Data([99]).write(to: occupied) }
            }
            let disk = Calls(folder: source, timeZone: .gmt, duration: { _ in 0 }, transcript: { _ in [] }, disk: .system)
            await #expect(throws: (any Error).self) { try disk.move(id: id, to: target) }
            #expect(try FileManager.default.contentsOfDirectory(atPath: target.path) == [name])
            #expect(try Data(contentsOf: source.appendingPathComponent(name + "/one")) == Data([1, 2, 3]))
            if kind == "file" { #expect(try Data(contentsOf: occupied) == Data([99])) }
        }
    }

    @Test func missingCallAndDestinationInsideTheCallFailWithoutChanges() async throws {
        try await withMoveFolders { (source: URL, target: URL) async throws in
            let disk = Calls(folder: source, timeZone: .gmt, duration: { _ in 0 }, transcript: { _ in [] }, disk: .system)
            await #expect(throws: (any Error).self) { try disk.move(id: "gone", to: target) }
            await #expect(throws: (any Error).self) { try disk.move(id: id, to: source.appendingPathComponent(name + "/nested")) }
            #expect(try FileManager.default.contentsOfDirectory(atPath: target.path).isEmpty)
            #expect(try Data(contentsOf: source.appendingPathComponent(name + "/nested/two")) == Data([4, 5, 6, 7]))
        }
    }
}

private let id = "2026.10.24-1405"
private let name = id + " Zoom"
private func testCalls(folder: URL,
                       children: @escaping @Sendable (URL) throws -> [URL] = { try FileManager.default.contentsOfDirectory(at: $0, includingPropertiesForKeys: nil) },
                       values: @escaping @Sendable (URL) throws -> URLResourceValues = { try $0.resourceValues(forKeys: [.isDirectoryKey, .isSymbolicLinkKey, .fileSizeKey]) },
                       copy: @escaping @Sendable (URL, URL) throws -> Void,
                       remove: @escaping @Sendable (URL) throws -> Void = { try FileManager.default.removeItem(at: $0) }) -> Calls {
    Calls(folder: folder, timeZone: .gmt,
          duration: { _ in 0 },
          transcript: { _ in [] },
          disk: CallsDisk(
              children: children,
              values: values,
              copy: copy,
              rename: { from, to in
              guard renamex_np(from.path, to.path, UInt32(RENAME_EXCL)) == 0 else { throw POSIXError(.EIO) }
          },
              trash: { _ in throw POSIXError(.EPERM) },
              remove: remove))
}
private func withMoveFolders(_ work: @escaping @Sendable (URL, URL) async throws -> Void) async throws {
    let root = FileManager.default.temporaryDirectory.resolvingSymlinksInPath().appendingPathComponent(UUID().uuidString)
    let source = root.appendingPathComponent("source"), target = root.appendingPathComponent("target")
    do {
        try FileManager.default.createDirectory(at: source.appendingPathComponent(name + "/nested"), withIntermediateDirectories: true)
        try FileManager.default.createDirectory(at: target, withIntermediateDirectories: true)
        try Data([1, 2, 3]).write(to: source.appendingPathComponent(name + "/one"))
        try Data([4, 5, 6, 7]).write(to: source.appendingPathComponent(name + "/nested/two"))
    }
    try await withCleanup { try await work(source, target) } cleanup: { try FileManager.default.removeItem(at: root) }
}

private func sameMoveDirectory(_ left: URL, _ right: URL) throws -> Bool {
    var lhs = stat(), rhs = stat()
    guard stat(left.path, &lhs) == 0, stat(right.path, &rhs) == 0 else { throw POSIXError(.EIO) }
    return lhs.st_dev == rhs.st_dev && lhs.st_ino == rhs.st_ino
}
