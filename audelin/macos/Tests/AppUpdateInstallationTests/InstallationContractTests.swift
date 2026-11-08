import BlockingTestWork
import Foundation
import Testing
@testable import AppUpdateInstallation

struct InstallationContractTests {
    /// Contract test: filesystem aliases resolve to the physical paths emitted by FSEvents.
    @Test(arguments: [false, true])
    func watchPathsPreservePrivatePrefixAndResolveParentAliases(bundleExists: Bool) async throws {
        let name = UUID().uuidString
        let physicalRoot = "/private/tmp/" + name
        let root = URL(filePath: physicalRoot)
        do {
            try FileManager.default.createDirectory(at: root, withIntermediateDirectories: false)
        }
        try await withCleanup {
            let link = root.appendingPathComponent("linked-parent")
            do {
                try FileManager.default.createSymbolicLink(at: link, withDestinationURL: root)
                if bundleExists {
                    try FileManager.default.createDirectory(at: root.appendingPathComponent("Audelin.app"), withIntermediateDirectories: false)
                }
            }
            for parent in [root, URL(filePath: "/tmp/" + name), link] {
                let bundle = parent.appendingPathComponent("Audelin.app")
                let paths = try #require(watchPaths(for: bundle))
                #expect(paths.root == physicalRoot)
                #expect(paths.bundle == physicalRoot + "/Audelin.app")
                #expect(isBundleEvent(physicalRoot + "/Audelin.app/Contents/Info.plist", flags: 0, bundlePath: paths.bundle))
            }
        } cleanup: {
            try FileManager.default.removeItem(at: root)
        }
    }

    /// Contract test: file changes reach the adapter through a real FSEvents stream.
    @Test(arguments: [false, true])
    func fileChangeDeliversAndStopFinishesStream(symlinkedParent: Bool) async throws {
        try await withBundle { bundle in
            let watchedBundle: URL
            if symlinkedParent {
                let link = bundle.deletingLastPathComponent().appendingPathComponent("linked-parent")
                do {
                    try FileManager.default.createSymbolicLink(at: link, withDestinationURL: bundle.deletingLastPathComponent())
                }
                watchedBundle = link.appendingPathComponent("Audelin.app")
            } else {
                watchedBundle = bundle
            }
            let installation = Installation(bundle: watchedBundle, pid: 123)
            let changes = await installation.watch()
            do {
                try await beforeDeadline {
                    var iterator = changes.makeAsyncIterator()
                    try await writePlist(bundle, identifier: "dev.igor1309.audelin", build: "replacement")
                    #expect(await iterator.next() != nil)
                    await installation.stopWatching()
                    // FSEvents may coalesce writes or deliver more than one wake.
                    while await iterator.next() != nil {}
                }
            } catch {
                await installation.stopWatching()
                throw error
            }
        }
    }

    /// Contract test: the real shell helper waits for a live pid, then opens the supplied bundle once.
    @Test func relaunchShellWaitsForExitThenOpensBundleOnce() async throws {
        try await withBundle { bundle in
            try await writePlist(bundle, identifier: "dev.igor1309.audelin", build: "installed")
            let marker = bundle.deletingLastPathComponent().appendingPathComponent("opened")
            let opener = bundle.deletingLastPathComponent().appendingPathComponent("stand-in opener")
            let parent = Process()
            let input = Pipe()
            parent.executableURL = URL(filePath: "/bin/cat")
            parent.standardInput = input
            parent.standardOutput = FileHandle.nullDevice
            parent.standardError = FileHandle.nullDevice
            try parent.run()
            try await withCleanup {
                let pid = parent.processIdentifier
                do {
                    let source = """
                    #!/bin/sh
                    if kill -0 \(pid) 2>/dev/null; then status=alive; else status=exited; fi
                    printf '%s\\n%s\\n' "$status" "$1" >> "$(dirname "$0")/opened"
                    """
                    try Data(source.utf8).write(to: opener)
                    try FileManager.default.setAttributes([.posixPermissions: 0o700], ofItemAtPath: opener.path)
                }
                let launches = AsyncStream<Process>.makeStream()
                let installation = Installation(bundle: bundle, pid: pid, run: { process in
                    launches.continuation.yield(process)
                    launches.continuation.finish()
                })
                try await installation.relaunch(opener: opener.path)
                var launched = launches.stream.makeAsyncIterator()
                let helper = try #require(await launched.next())
                // Shell tracing reports entry into the wait without guessing how
                // long the scheduler needs to start the helper.
                helper.arguments?.insert("-x", at: 0)
                let trace = Pipe()
                let lines = AsyncStream<Data>.makeStream()
                trace.fileHandleForReading.readabilityHandler = { handle in
                    let data = handle.availableData
                    if data.isEmpty { lines.continuation.finish() }
                    else { lines.continuation.yield(data) }
                }
                helper.standardError = trace
                do {
                    try await beforeDeadline {
                        try await withThrowingTaskGroup(of: Void.self) { group in
                            group.addTask {
                                let status = try await exitStatus(of: helper)
                                #expect(status == 0)
                            }
                            do {
                                var output = ""
                                for await data in lines.stream {
                                    output += String(decoding: data, as: UTF8.self)
                                    if output.components(separatedBy: "/bin/sleep 0.1").count >= 3 { break }
                                }
                                try #require(output.components(separatedBy: "/bin/sleep 0.1").count >= 3)
                                #expect(parent.isRunning)
                                #expect(!FileManager.default.fileExists(atPath: marker.path))
                                parent.terminate()
                                parent.waitUntilExit()
                                try await group.waitForAll()
                            } catch {
                                group.cancelAll()
                                throw error
                            }
                        }
                    }
                    let opened = try String(contentsOf: marker, encoding: .utf8)
                    #expect(opened == "exited\n\(bundle.path)\n")
                } catch {
                    trace.fileHandleForReading.readabilityHandler = nil
                    lines.continuation.finish()
                    throw error
                }
                trace.fileHandleForReading.readabilityHandler = nil
                lines.continuation.finish()
            } cleanup: {
                if parent.isRunning { parent.terminate() }
                parent.waitUntilExit()
                try input.fileHandleForWriting.close()
            }
        }
    }
}

private struct ContractDeadline: Error {}

private func beforeDeadline(_ body: @escaping @Sendable () async throws -> Void) async throws {
    try await withThrowingTaskGroup(of: Void.self) { group in
        group.addTask { try await body() }
        group.addTask {
            try await Task.sleep(for: .seconds(20))
            throw ContractDeadline()
        }
        defer { group.cancelAll() }
        try await group.next()
    }
}
