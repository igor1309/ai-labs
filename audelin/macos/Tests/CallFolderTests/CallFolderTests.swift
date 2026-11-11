import BlockingTestWork
import Darwin
import Foundation
import Synchronization
import Testing
import TrackFile
import TranscriptFile
@testable import CallFolder

@Suite(.timeLimit(.minutes(1)))
struct CallFolderTests {

    @Test func madeFolderUsesGivenTimeZoneAndContainsWritablePlaces() async throws {

        try await withCallsFolder { calls in
            let made = try maker(calls).make()
            #expect(made.url == calls.appendingPathComponent("2026.10.24-1405", isDirectory: true))
            try await expectDirectory(made.url)
            let places = [made.microphoneURL, made.callURL, made.transcriptURL]
            #expect(Set(places).count == 3)
            #expect(places.map(\.lastPathComponent) == ["microphone.caf", "call.caf", "transcript.md"])
            for place in places {
                #expect(place.deletingLastPathComponent() == made.url)
                #expect(await !exists(place.path))
            }
            #expect(try await names(made.url).isEmpty)
            for place in [made.microphoneURL, made.callURL] {
                let track = try await TrackFile(url: place)
                try await track.close()
            }
            let transcript = try await TranscriptFile(url: made.transcriptURL, initialBytes: [Data("initial bytes\n".utf8)], binding: DiskTranscriptBinding())
            await transcript.close()
            #expect(try await names(made.url) == ["call.caf", "microphone.caf", "transcript.md"])
            for place in places {
                #expect(try await fileType(place) == .typeRegular)
            }
            #expect(try await names(calls) == ["2026.10.24-1405"])
        }
    }

    @Test func retainedNamesReserveIdentitiesAcrossTitlesAndEachAllocationReadsThemAgain() async throws {
        try await withCallsFolder { calls in
            let occupied = Mutex(["2026.10.24-1405 Zoom", "2026.10.24-1405-2", "other"])
            let adapter = CallFolder(callsURL: calls, now: { fixedStart }, timeZone: tokyo,
                                     occupiedNames: { occupied.withLock { $0 } }, disk: .system)
            let first = try adapter.make(title: "Meet")
            #expect(first.url.lastPathComponent == "2026.10.24-1405-3 Meet")
            occupied.withLock { $0.append("2026.10.24-1405-4 Finder") }
            let second = try adapter.make()
            #expect(second.url.lastPathComponent == "2026.10.24-1405-5")
            #expect(try await names(calls) == ["2026.10.24-1405-3 Meet", "2026.10.24-1405-5"])
        }
    }

    @Test func failureReadingRetainedNamesFailsWithoutAllocatingAnIdentity() async throws {
        try await withCallsFolder { calls in
            let adapter = CallFolder(callsURL: calls, now: { fixedStart }, timeZone: tokyo,
                                     occupiedNames: { throw POSIXError(.EACCES) }, disk: .system)
            await #expect(throws: POSIXError(.EACCES)) { try adapter.make() }
            let remaining = try await names(calls)
            #expect(remaining.isEmpty)
        }
    }

    @Test func madeFolderIsPrivateToTheUser() async throws {

        try await withCallsFolder { calls in
            let made = try maker(calls).make()
            let mode = try {
                try FileManager.default.attributesOfItem(atPath: made.url.path)[.posixPermissions] as? Int
            }()
            #expect(mode == 0o700)
        }
    }

    @Test func titleFollowsTheIdAndAnIdTakenByAnyTitleIsNumbered() async throws {

        try await withCallsFolder { calls in
            let adapter = CallFolder(callsURL: calls, now: { fixedStart.addingTimeInterval(249_540) }, timeZone: tokyo, occupiedNames: { [] }, disk: .system)
            let made = try { try [
                adapter.make(title: "Zoom"), adapter.make(), adapter.make(title: "Zoom"),
                adapter.make(title: "a/b:c"), adapter.make(title: "//::"), adapter.make(title: ""),
            ] }()
            #expect(made.map(\.url.lastPathComponent) == [
                "2026.10.27-1124 Zoom", "2026.10.27-1124-2", "2026.10.27-1124-3 Zoom",
                "2026.10.27-1124-4 a-b-c", "2026.10.27-1124-5 ----", "2026.10.27-1124-6",
            ])
            for folder in made { try await expectDirectory(folder.url) }
        }
    }

    @Test func eachMakeIsNamedByItsOwnTime() async throws {

        try await withCallsFolder { calls in
            let clock = Mutex(fixedStart)
            let adapter = CallFolder(callsURL: calls, now: { clock.withLock { $0 } }, timeZone: tokyo, occupiedNames: { [] }, disk: .system)
            let first = try adapter.make()
            clock.withLock { $0 = fixedStart.addingTimeInterval(60) }
            let second = try adapter.make()
            #expect([first, second].map(\.url.lastPathComponent) == ["2026.10.24-1405", "2026.10.24-1406"])
        }
    }

    @Test func threeCallsInSameMinuteKeepSeparateFoldersAndFirstContents() async throws {

        try await withCallsFolder { calls in
            let adapter = maker(calls)
            let first = try adapter.make()
            let kept = first.url.appendingPathComponent("kept")
            let bytes = Data([0, 255, 42, 10])
            try bytes.write(to: kept)
            let second = try adapter.make()
            let third = try adapter.make()
            #expect([first, second, third].map(\.url.lastPathComponent) == [
                "2026.10.24-1405", "2026.10.24-1405-2", "2026.10.24-1405-3"
            ])
            for made in [first, second, third] { try await expectDirectory(made.url) }
            #expect(try await contents(kept) == bytes)
            #expect(try await names(first.url) == ["kept"])
            #expect(try await names(second.url).isEmpty)
            #expect(try await names(third.url).isEmpty)
        }
    }

    @Test func fileTakingNameIsSkippedWithoutChangingBytes() async throws {

        try await withCallsFolder { calls in
            let taken = calls.appendingPathComponent("2026.10.24-1405")
            let bytes = Data([0, 255, 42, 10])
            try bytes.write(to: taken)
            let made = try maker(calls).make()
            #expect(made.url.lastPathComponent == "2026.10.24-1405-2")
            try await expectDirectory(made.url)
            #expect(try await contents(taken) == bytes)
            #expect(try await names(calls) == ["2026.10.24-1405", "2026.10.24-1405-2"])
        }
    }

    @Test func missingCallsFolderFailsWithoutCreatingAnything() async throws {

        try await withCallsFolder { calls in
            try FileManager.default.removeItem(at: calls)
            await #expect(throws: POSIXError(.ENOENT)) { try maker(calls).make() }
            #expect(await !exists(calls.path))
            #expect(try await names(calls.deletingLastPathComponent()).isEmpty)
        }
    }

    @Test(arguments: [POSIXErrorCode.EACCES, .ENOSPC, .EIO])
    func failedMakeLeavesCallsFolderEmptyAndNameAvailable(code: POSIXErrorCode) async throws {

        try await withCallsFolder { calls in
            try FileManager.default.setAttributes([.posixPermissions: 0o555], ofItemAtPath: calls.path)
                        // Inject the denial because privileged test runners can write read-only folders.
            let adapter = CallFolder(callsURL: calls, now: { fixedStart }, timeZone: tokyo, occupiedNames: { [] }, disk: CallFolderDisk(createDirectory: { _ in
                throw POSIXError(code)
            }, names: { _ in [] }))
            await #expect(throws: POSIXError(code)) { try adapter.make() }
            #expect(try await names(calls).isEmpty)
            try FileManager.default.setAttributes([.posixPermissions: 0o755], ofItemAtPath: calls.path)
            let retry = try maker(calls).make()
            #expect(retry.url.lastPathComponent == "2026.10.24-1405")
            try await expectDirectory(retry.url)
        }
    }

    @Test func symlinkTakingNameAndItsTargetRemainUnchanged() async throws {

        try await withCallsFolder { calls in
            let target = calls.deletingLastPathComponent().appendingPathComponent("target", isDirectory: true)
            try FileManager.default.createDirectory(at: target, withIntermediateDirectories: false)
            let kept = target.appendingPathComponent("kept")
            let bytes = Data([0, 255, 42, 10])
            try bytes.write(to: kept)
            let link = calls.appendingPathComponent("2026.10.24-1405")
            try FileManager.default.createSymbolicLink(at: link, withDestinationURL: target)
            let made = try maker(calls).make()
            #expect(made.url.lastPathComponent == "2026.10.24-1405-2")
            try await expectDirectory(made.url)
            #expect(try FileManager.default.destinationOfSymbolicLink(atPath: link.path) == target.path)
            #expect(try await names(target) == ["kept"])
            #expect(try await contents(kept) == bytes)
            #expect(try await names(calls) == ["2026.10.24-1405", "2026.10.24-1405-2"])
        }
    }

    @Test func brokenSymlinkTakingNameIsSkippedWithoutCreatingTarget() async throws {

        try await withCallsFolder { calls in
            let target = calls.deletingLastPathComponent().appendingPathComponent("missing", isDirectory: true)
            let link = calls.appendingPathComponent("2026.10.24-1405")
            try FileManager.default.createSymbolicLink(at: link, withDestinationURL: target)
            let made = try maker(calls).make()
            #expect(made.url.lastPathComponent == "2026.10.24-1405-2")
            try await expectDirectory(made.url)
            #expect(try FileManager.default.destinationOfSymbolicLink(atPath: link.path) == target.path)
            #expect(await !exists(target.path))
            #expect(try await names(calls) == ["2026.10.24-1405", "2026.10.24-1405-2"])
        }
    }

    @Test func anEntryOfAnyKindWithTheIdAndATitleTakesTheId() async throws {

        try await withCallsFolder { calls in
            let bytes = Data([0, 255, 42, 10])
            try bytes.write(to: calls.appendingPathComponent("2026.10.24-1405 Meet"))
            do { try FileManager.default.createDirectory(
                at: calls.appendingPathComponent("2026.10.24-1405-2 Zoom"), withIntermediateDirectories: false) }
            try bytes.write(to: calls.appendingPathComponent("2026.10.24-14050"))
            let made = try maker(calls).make(title: "Zoom")
            #expect(made.url.lastPathComponent == "2026.10.24-1405-3 Zoom")
            #expect(try await contents(calls.appendingPathComponent("2026.10.24-1405 Meet")) == bytes)
            #expect(try await names(calls) == [
                "2026.10.24-1405 Meet", "2026.10.24-1405-2 Zoom", "2026.10.24-1405-3 Zoom", "2026.10.24-14050",
            ])
        }
    }

    @Test func failedListingFailsWithoutCreatingAnything() async throws {

        try await withCallsFolder { calls in
            let adapter = CallFolder(callsURL: calls, now: { fixedStart }, timeZone: tokyo, occupiedNames: { [] }, disk: CallFolderDisk(createDirectory: { _ in
                Issue.record("made a folder after listing failed")
            }, names: { _ in throw POSIXError(.EACCES) }))
            await #expect(throws: POSIXError(.EACCES)) { try adapter.make() }
            let left = try await names(calls)
            #expect(left.isEmpty)
        }
    }

    @Test func everyTakenNameIsSkippedWithoutChangingFolderOrFile() async throws {

        try await withCallsFolder { calls in
            let folder = calls.appendingPathComponent("2026.10.24-1405", isDirectory: true)
            try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: false)
            let kept = folder.appendingPathComponent("kept")
            let file = calls.appendingPathComponent("2026.10.24-1405-2")
            let bytes = Data([0, 255, 42, 10])
            try bytes.write(to: kept)
            try bytes.write(to: file)
            let made = try maker(calls).make()
            #expect(made.url.lastPathComponent == "2026.10.24-1405-3")
            try await expectDirectory(made.url)
            #expect(try await names(folder) == ["kept"])
            #expect(try await contents(kept) == bytes)
            #expect(try await contents(file) == bytes)
            #expect(try await names(calls) == ["2026.10.24-1405", "2026.10.24-1405-2", "2026.10.24-1405-3"])
        }
    }
}

private let fixedStart = Date(timeIntervalSince1970: 1_792_818_330)
private let tokyo = TimeZone(identifier: "Asia/Tokyo")!

private func maker(_ calls: URL) -> CallFolder {

    CallFolder(callsURL: calls, now: { fixedStart }, timeZone: tokyo, occupiedNames: { [] }, disk: .system)
}

private func names(_ folder: URL) async throws -> [String] {

    try FileManager.default.contentsOfDirectory(atPath: folder.path).sorted()
}

private func contents(_ file: URL) async throws -> Data { try Data(contentsOf: file) }

private func exists(_ path: String) async -> Bool { FileManager.default.fileExists(atPath: path) }

private func fileType(_ url: URL) async throws -> FileAttributeType? {

    try FileManager.default.attributesOfItem(atPath: url.path)[.type] as? FileAttributeType
}

private func expectDirectory(_ url: URL) async throws {

    #expect(try await fileType(url) == .typeDirectory)
}

private func withCallsFolder(_ body: (URL) async throws -> Void) async throws {

    let root = FileManager.default.temporaryDirectory.appendingPathComponent("CallFolderTests-\(UUID())", isDirectory: true)
    try FileManager.default.createDirectory(at: root, withIntermediateDirectories: false)
    let calls = root.appendingPathComponent("calls", isDirectory: true)
    do {
        try FileManager.default.createDirectory(at: calls, withIntermediateDirectories: false)
        try await body(calls)
    } catch {
        try? FileManager.default.removeItem(at: root)
        throw error
    }
    try? FileManager.default.removeItem(at: root)
}
