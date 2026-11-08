import BlockingTestWork
import Foundation
import Testing
@testable import AppUpdateInstallation

struct InstallationTests {
    @Test(arguments: ["sha-20261108T063502Z", "sha-dirty-20261108T063502Z"])
    func validBundleReadsBuildID(id: String) async throws {
        try await withBundle { bundle in
            try await writePlist(bundle, identifier: "dev.igor1309.audelin", build: id)
            let reader = Installation(bundle: bundle, pid: 123)
            #expect(await reader.readBuildID() == id)
        }
    }

    @Test func missingFileIsUnreadable() async throws {
        try await withBundle { bundle in
            #expect(await Installation(bundle: bundle, pid: 123).readBuildID() == nil)
        }
    }

    @Test(arguments: ["dev.other.app", "", nil])
    func otherOrMissingBundleIdentifierIsUnreadable(identifier: String?) async throws {
        try await withBundle { bundle in
            try await writePlist(bundle, identifier: identifier, build: "installed")
            #expect(await Installation(bundle: bundle, pid: 123).readBuildID() == nil)
        }
    }

    @Test(arguments: [String?.none, ""])
    func missingOrEmptyBuildIDIsUnreadable(id: String?) async throws {
        try await withBundle { bundle in
            try await writePlist(bundle, identifier: "dev.igor1309.audelin", build: id)
            #expect(await Installation(bundle: bundle, pid: 123).readBuildID() == nil)
        }
    }

    @Test func malformedPlistIsUnreadable() async throws {
        try await withBundle { bundle in
            try await offPool {
                try Data("incomplete plist".utf8).write(to: bundle.appendingPathComponent("Contents/Info.plist"))
            }
            #expect(await Installation(bundle: bundle, pid: 123).readBuildID() == nil)
        }
    }

    @Test func nonStringBuildIDIsUnreadable() async throws {
        try await withBundle { bundle in
            try await offPool {
                let data = try PropertyListSerialization.data(fromPropertyList: [
                    "CFBundleIdentifier": "dev.igor1309.audelin", "AudelinBuildID": 42,
                ], format: .binary, options: 0)
                try data.write(to: bundle.appendingPathComponent("Contents/Info.plist"))
            }
            #expect(await Installation(bundle: bundle, pid: 123).readBuildID() == nil)
        }
    }

    @Test func missingBundleCannotStartRelaunch() async throws {
        try await withBundle { bundle in
            let installation = Installation(bundle: bundle, pid: 123)
            await #expect(throws: Installation.Failure.unreadableBundle) { try await installation.relaunch() }
        }
    }

    @Test(arguments: [
        ("/Applications/Audelin.app", true), ("/Applications/Audelin.app/", true),
        ("/Applications/Audelin.app/Contents/Info.plist", true),
        ("/Applications/Audelin.app.new/Contents/Info.plist", false),
        ("/Applications/Other.app", false), ("/Applications", false),
    ])
    func filtersBundlePathAtComponentBoundary(path: String, matches: Bool) {
        #expect(isBundlePath(path, bundlePath: "/Applications/Audelin.app") == matches)
    }
}

private func writePlist(_ bundle: URL, identifier: String?, build: String?) async throws {
    try await offPool {
        var values: [String: String] = [:]
        values["CFBundleIdentifier"] = identifier
        values["AudelinBuildID"] = build
        let data = try PropertyListSerialization.data(fromPropertyList: values, format: .xml, options: 0)
        try data.write(to: bundle.appendingPathComponent("Contents/Info.plist"))
    }
}

private func withBundle(_ body: (URL) async throws -> Void) async throws {
    let root = try await offPool {
        let root = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        try FileManager.default.createDirectory(at: root.appendingPathComponent("Audelin.app/Contents"), withIntermediateDirectories: true)
        return root
    }
    try await withCleanup {
        try await body(root.appendingPathComponent("Audelin.app"))
    } cleanup: {
        try FileManager.default.removeItem(at: root)
    }
}

struct RelaunchTests {
    @Test func launchUsesFixedShellSourceAndSeparatePIDAndPathArguments() async throws {
        try await withBundle { bundle in
            try await writePlist(bundle, identifier: "dev.igor1309.audelin", build: "installed")
            let launched = AsyncStream<Launch>.makeStream()
            let installation = Installation(bundle: bundle, pid: 456, run: { process in
                launched.continuation.yield(Launch(process))
                launched.continuation.finish()
            })
            try await installation.relaunch()
            var iterator = launched.stream.makeAsyncIterator()
            let launch = try #require(await iterator.next())
            #expect(launch.executable == "/bin/sh")
            #expect(launch.arguments == ["-c", Installation.relaunchScript, "audelin-relaunch", "456", bundle.path])
            #expect(launch.inputIsNull && launch.outputIsNull && launch.errorIsNull)
        }
    }

    @Test func processStartFailurePropagates() async throws {
        try await withBundle { bundle in
            try await writePlist(bundle, identifier: "dev.igor1309.audelin", build: "installed")
            let installation = Installation(bundle: bundle, pid: 456, run: { _ in throw LaunchFailed() })
            await #expect(throws: LaunchFailed.self) { try await installation.relaunch() }
        }
    }

    @Test func missingBundleDoesNotLaunchProcess() async throws {
        try await withBundle { bundle in
            let installation = Installation(bundle: bundle, pid: 456, run: { _ in Issue.record("Missing bundle launched") })
            await #expect(throws: Installation.Failure.unreadableBundle) { try await installation.relaunch() }
        }
    }
}

private struct Launch: Sendable {
    let executable: String?
    let arguments: [String]
    let inputIsNull: Bool
    let outputIsNull: Bool
    let errorIsNull: Bool
    init(_ process: Process) {
        executable = process.executableURL?.path
        arguments = process.arguments ?? []
        inputIsNull = (process.standardInput as? FileHandle) === FileHandle.nullDevice
        outputIsNull = (process.standardOutput as? FileHandle) === FileHandle.nullDevice
        errorIsNull = (process.standardError as? FileHandle) === FileHandle.nullDevice
    }
}

private struct LaunchFailed: Error {}
