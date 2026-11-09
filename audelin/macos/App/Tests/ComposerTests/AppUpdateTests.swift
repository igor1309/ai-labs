import BlockingTestWork
import Foundation
import Observation
import Testing
@testable import Composer

/// An update replaces the running bundle; the app relaunches only once idle.
@MainActor
@Suite(.timeLimit(.minutes(1)))
struct AppUpdateTests {

    private struct Failed: Error {}

    @Test func idleAppStartsTheRelaunchThenQuits() async throws {

        let order = Values<String>()
        try await withComposition(terminate: { order.append("terminated") }) { rig in
            #expect(await rig.menu.relaunchIfIdle { order.append("relaunch") })
            #expect(order.all == ["relaunch", "terminated"])
        }
    }

    @Test func recordingIsNotInterruptedAndTheRelaunchFollowsItsEnd() async throws {

        let relaunches = Values<Bool>(), terminated = Values<Bool>()
        try await withComposition(terminate: { terminated.append(true) }) { rig in
            try await rig.start()
            #expect(await !rig.menu.relaunchIfIdle { relaunches.append(true) })
            #expect(relaunches.all.isEmpty && terminated.all.isEmpty)
            #expect(rig.microphone.stops.all.isEmpty)
            #expect(try await rig.state { _ in true }.phase == .recording)

            try await rig.stop()
            await reachIdle(rig)
            #expect(await rig.menu.relaunchIfIdle { relaunches.append(true) })
            #expect(relaunches.all == [true] && terminated.all == [true])
        }
    }

    @Test func folderMoveHoldsTheRelaunch() async throws {

        let terminated = Values<Bool>()
        try await withComposition(terminate: { terminated.append(true) }) { rig in
            #expect(await rig.menu.reserveCallsFolder())
            #expect(await !rig.menu.relaunchIfIdle { Issue.record("relaunched during a move") })
            #expect(terminated.all.isEmpty)
            await rig.menu.releaseCallsFolder()
            #expect(await rig.menu.relaunchIfIdle {})
            #expect(terminated.all == [true])
        }
    }

    @Test func openFolderPickerHoldsTheRelaunch() async throws {

        try await withComposition { rig in
            let entered = AsyncStream<Void>.makeStream(), choice = AsyncStream<Void>.makeStream()
            rig.menu.installFolderPicker {
                entered.continuation.yield()
                for await _ in choice.stream { break }
                return nil
            }
            let picking = Task { await rig.menu.sendSettings(.changeFolder) }
            for await _ in entered.stream { break }
            #expect(await !rig.menu.relaunchIfIdle { Issue.record("relaunched behind the picker") })
            choice.continuation.yield()
            await picking.value
            #expect(await rig.menu.relaunchIfIdle {})
        }
    }

    @Test func failedRelaunchKeepsTheAppRunningAndFreesTheReservation() async throws {

        let terminated = Values<Bool>()
        try await withComposition(terminate: { terminated.append(true) }) { rig in
            #expect(await !rig.menu.relaunchIfIdle { throw Failed() })
            #expect(terminated.all.isEmpty)
            #expect(await rig.menu.reserveCallsFolder())
            await rig.menu.releaseCallsFolder()
        }
    }

    @Test func watchRelaunchesOnlyAfterTheBundleIsReplaced() async throws {

        let polls = AsyncStream<Void>.makeStream(), checked = AsyncStream<Void>.makeStream()
        let relaunched = AsyncStream<Void>.makeStream()
        let isReplaced = Values<Bool>()
        try await withComposition { rig in
            var iterator = checked.stream.makeAsyncIterator()
            let shared = PollSource(polls.stream)
            rig.menu.relaunchAfterUpdate(wait: { try await shared.next() }, replaced: {
                defer { checked.continuation.yield() }
                return !isReplaced.all.isEmpty
            }, relaunch: { relaunched.continuation.yield() })

            polls.continuation.yield()
            await iterator.next()
            isReplaced.append(true)
            polls.continuation.yield()
            var done = relaunched.stream.makeAsyncIterator()
            await done.next()
            polls.continuation.finish()
        }
    }

    @Test func replacingTheBundleByRenameIsSeenAndAMissingBundleIsNot() async throws {

        try await withComposeFolder { root in
            let bundle = root.appendingPathComponent("Audelin.app"), staged = root.appendingPathComponent("new")
            let old = root.appendingPathComponent("old"), files = FileManager.default
            try files.createDirectory(at: bundle, withIntermediateDirectories: false)
            try files.createDirectory(at: staged, withIntermediateDirectories: false)
            let replaced = bundleReplaced(at: bundle)
            #expect(!replaced())
            try files.moveItem(at: bundle, to: old)
            #expect(!replaced())
            try files.moveItem(at: staged, to: bundle)
            try files.removeItem(at: old)
            #expect(replaced())
        }
    }

    @Test func relaunchWaitsForTheProcessToExitThenOpensTheBundle() async throws {

        try await withComposeFolder { root in
            let opened = root.appendingPathComponent("opened"), open = root.appendingPathComponent("open")
            try "#!/bin/sh\n[ -e \"$MARK\" ] || exit 1\necho \"$1\" > \"\(opened.path)\"\n"
                .write(to: open, atomically: true, encoding: .utf8)
            try FileManager.default.setAttributes([.posixPermissions: 0o755], ofItemAtPath: open.path)

            let mark = root.appendingPathComponent("exited")
            let app = Process()
            app.executableURL = URL(fileURLWithPath: "/bin/sh")
            app.arguments = ["-c", "sleep 0.5; touch \"\(mark.path)\""]
            try app.run()

            let bundle = root.appendingPathComponent("A pp.app")
            let helper = relaunchProcess(after: app.processIdentifier, bundle: bundle, open: open.path)
            helper.environment = ["MARK": mark.path, "PATH": "/bin:/usr/bin"]
            #expect(try await exitStatus(of: helper) == 0)
            #expect(try String(contentsOf: opened, encoding: .utf8) == bundle.path + "\n")
        }
    }

    private func reachIdle(_ rig: ComposeFixture) async {

        for await phase in Observations({ rig.menu.state.phase }) where phase == .idle { return }
    }
}

private final class PollSource: Sendable {

    private let polls: AsyncStream<Void>
    init(_ polls: AsyncStream<Void>) { self.polls = polls }
    func next() async throws {
        for await _ in polls { return }
        throw CancellationError()
    }
}
