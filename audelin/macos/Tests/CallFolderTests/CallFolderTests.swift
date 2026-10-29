import Darwin
import Foundation
import Synchronization
import Testing
import TrackFile
import TranscriptFile
@testable import CallFolder

// These tests change the process's formatting defaults, so they run one at a time.
@Suite(.serialized, .timeLimit(.minutes(1)))
struct CallFolderTests {

    @Test func madeFolderUsesGivenTimeZoneAndContainsWritablePlaces() async throws {

        try await withCallsFolder { calls in
            let made = try maker(calls).make()
            #expect(made.url == calls.appendingPathComponent("2026.10.24-1405", isDirectory: true))
            try expectDirectory(made.url)
            let places = [made.microphoneURL, made.callURL, made.transcriptURL]
            #expect(Set(places).count == 3)
            #expect(places.map(\.lastPathComponent) == ["microphone.caf", "call.caf", "transcript.md"])
            for place in places {
                #expect(place.deletingLastPathComponent() == made.url)
                #expect(!FileManager.default.fileExists(atPath: place.path))
            }
            #expect(try names(made.url).isEmpty)
            for place in [made.microphoneURL, made.callURL] {
                let track = try await TrackFile(url: place)
                try await track.close()
            }
            let transcript = try await TranscriptFile(url: made.transcriptURL)
            await transcript.close()
            #expect(try names(made.url) == ["call.caf", "microphone.caf", "transcript.md"])
            for place in places {
                #expect(try FileManager.default.attributesOfItem(atPath: place.path)[.type] as? FileAttributeType == .typeRegular)
            }
            #expect(try names(calls) == ["2026.10.24-1405"])
        }
    }

    @Test func titleFollowsTheTimestampAndATakenNameNumbersTheTimestamp() async throws {

        try await withCallsFolder { calls in
            let adapter = CallFolder(callsURL: calls, now: { fixedStart.addingTimeInterval(249_540) }, timeZone: tokyo)
            let made = try [
                adapter.make(title: "Zoom"), adapter.make(), adapter.make(title: "Zoom"),
                adapter.make(title: "a/b:c"), adapter.make(title: "//::"),
            ]
            #expect(made.map(\.url.lastPathComponent) == [
                "2026.10.27-1124 Zoom", "2026.10.27-1124", "2026.10.27-1124-2 Zoom",
                "2026.10.27-1124 a-b-c", "2026.10.27-1124 ----",
            ])
            for folder in made { try expectDirectory(folder.url) }
        }
    }

    @Test func eachMakeIsNamedByItsOwnTime() async throws {

        try await withCallsFolder { calls in
            let clock = Mutex(fixedStart)
            let adapter = CallFolder(callsURL: calls, now: { clock.withLock { $0 } }, timeZone: tokyo)
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
            for made in [first, second, third] { try expectDirectory(made.url) }
            #expect(try Data(contentsOf: kept) == bytes)
            #expect(try names(first.url) == ["kept"])
            #expect(try names(second.url).isEmpty)
            #expect(try names(third.url).isEmpty)
        }
    }

    @Test func fileTakingNameIsSkippedWithoutChangingBytes() async throws {

        try await withCallsFolder { calls in
            let taken = calls.appendingPathComponent("2026.10.24-1405")
            let bytes = Data([0, 255, 42, 10])
            try bytes.write(to: taken)
            let made = try maker(calls).make()
            #expect(made.url.lastPathComponent == "2026.10.24-1405-2")
            try expectDirectory(made.url)
            #expect(try Data(contentsOf: taken) == bytes)
            #expect(try names(calls) == ["2026.10.24-1405", "2026.10.24-1405-2"])
        }
    }

    @Test func missingCallsFolderFailsWithoutCreatingAnything() async throws {

        try await withCallsFolder { calls in
            try FileManager.default.removeItem(at: calls)
            #expect(throws: POSIXError(.ENOENT)) { try maker(calls).make() }
            #expect(!FileManager.default.fileExists(atPath: calls.path))
            #expect(try names(calls.deletingLastPathComponent()).isEmpty)
        }
    }

    @Test(arguments: [POSIXErrorCode.EACCES, .ENOSPC, .EIO])
    func failedMakeLeavesCallsFolderEmptyAndNameAvailable(code: POSIXErrorCode) async throws {

        try await withCallsFolder { calls in
            try FileManager.default.setAttributes([.posixPermissions: 0o555], ofItemAtPath: calls.path)
            defer { try? FileManager.default.setAttributes([.posixPermissions: 0o755], ofItemAtPath: calls.path) }
            // Inject the denial because privileged test runners can write read-only folders.
            let adapter = CallFolder(callsURL: calls, now: { fixedStart }, timeZone: tokyo, createDirectory: { _ in
                throw POSIXError(code)
            })
            #expect(throws: POSIXError(code)) { try adapter.make() }
            #expect(try names(calls).isEmpty)
            try FileManager.default.setAttributes([.posixPermissions: 0o755], ofItemAtPath: calls.path)
            let retry = try maker(calls).make()
            #expect(retry.url.lastPathComponent == "2026.10.24-1405")
            try expectDirectory(retry.url)
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
            try expectDirectory(made.url)
            #expect(try FileManager.default.destinationOfSymbolicLink(atPath: link.path) == target.path)
            #expect(try names(target) == ["kept"])
            #expect(try Data(contentsOf: kept) == bytes)
            #expect(try names(calls) == ["2026.10.24-1405", "2026.10.24-1405-2"])
        }
    }

    @Test func brokenSymlinkTakingNameIsSkippedWithoutCreatingTarget() async throws {

        try await withCallsFolder { calls in
            let target = calls.deletingLastPathComponent().appendingPathComponent("missing", isDirectory: true)
            let link = calls.appendingPathComponent("2026.10.24-1405")
            try FileManager.default.createSymbolicLink(at: link, withDestinationURL: target)
            let made = try maker(calls).make()
            #expect(made.url.lastPathComponent == "2026.10.24-1405-2")
            try expectDirectory(made.url)
            #expect(try FileManager.default.destinationOfSymbolicLink(atPath: link.path) == target.path)
            #expect(!FileManager.default.fileExists(atPath: target.path))
            #expect(try names(calls) == ["2026.10.24-1405", "2026.10.24-1405-2"])
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
            try expectDirectory(made.url)
            #expect(try names(folder) == ["kept"])
            #expect(try Data(contentsOf: kept) == bytes)
            #expect(try Data(contentsOf: file) == bytes)
            #expect(try names(calls) == ["2026.10.24-1405", "2026.10.24-1405-2", "2026.10.24-1405-3"])
        }
    }
}

private let fixedStart = Date(timeIntervalSince1970: 1_792_818_330)
private let tokyo = TimeZone(identifier: "Asia/Tokyo")!

private func maker(_ calls: URL) -> CallFolder {

    CallFolder(callsURL: calls, now: { fixedStart }, timeZone: tokyo)
}

private func names(_ folder: URL) throws -> [String] {

    try FileManager.default.contentsOfDirectory(atPath: folder.path).sorted()
}

private func expectDirectory(_ url: URL) throws {

    #expect(try FileManager.default.attributesOfItem(atPath: url.path)[.type] as? FileAttributeType == .typeDirectory)
}

private func withCallsFolder(_ body: (URL) async throws -> Void) async throws {

    let defaults = UserDefaults.standard
    let arguments = defaults.volatileDomain(forName: UserDefaults.argumentDomain)
    let processZone = getenv("TZ").map { String(cString: $0) }
    let zone = NSTimeZone.default
    defaults.setVolatileDomain(arguments.merging(["AppleLocale": "ar_SA"]) { _, new in new }, forName: UserDefaults.argumentDomain)
    setenv("TZ", "America/Los_Angeles", 1)
    tzset()
    NSTimeZone.resetSystemTimeZone()
    NSTimeZone.default = TimeZone(identifier: "America/Los_Angeles")!
    defer {
        defaults.setVolatileDomain(arguments, forName: UserDefaults.argumentDomain)
        if let processZone { setenv("TZ", processZone, 1) }
        else { unsetenv("TZ") }
        tzset()
        NSTimeZone.resetSystemTimeZone()
        NSTimeZone.default = zone
    }
    #expect(Locale.current.identifier == "ar_SA")
    #expect(Locale.current.calendar.identifier == .islamicUmmAlQura)
    #expect(TimeZone.current.identifier == "America/Los_Angeles")
    #expect(NSTimeZone.default.identifier == "America/Los_Angeles")
    let root = FileManager.default.temporaryDirectory.appendingPathComponent("CallFolderTests-\(UUID())", isDirectory: true)
    try FileManager.default.createDirectory(at: root, withIntermediateDirectories: false)
    defer { try? FileManager.default.removeItem(at: root) }
    let calls = root.appendingPathComponent("calls", isDirectory: true)
    try FileManager.default.createDirectory(at: calls, withIntermediateDirectories: false)
    try await body(calls)
}
