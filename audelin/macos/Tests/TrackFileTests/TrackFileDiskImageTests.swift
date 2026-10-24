import Foundation
import Testing

@Suite(.timeLimit(.minutes(1)))
struct TrackFileDiskImageTests {

    @Test(arguments: [DiskImageCommands.CancellationPoint.afterAttach, .duringBody])
    func cancellationAwaitsDetachBeforeRemovingFolder(point: DiskImageCommands.CancellationPoint) async throws {

        let commands = DiskImageCommands(point: point)
        let task = Task {
            try await withTrackFolder { folder in
                await commands.setFolder(folder)
                try await withDiskImage(in: folder, run: { try await commands.run($0, $1) }) { _ in
                    try await commands.body()
                }
            }
        }
        try await withTaskCancellationHandler {
            do {
                var events = commands.events.makeAsyncIterator()
                #expect(await events.next() == .cancellable)
                task.cancel()
                #expect(await events.next() == .detaching)
                // Detach is deliberately held until the test releases it.
                #expect(await commands.folderExists())
                commands.releaseDetach()
                await #expect(throws: CancellationError.self) { try await task.value }
                #expect(await events.next() == .detached)
                #expect(await !commands.folderExists())
            } catch {
                task.cancel()
                commands.releaseDetach()
                _ = await task.result
                throw error
            }
        } onCancel: {
            task.cancel()
            commands.releaseDetach()
        }
    }
}

actor DiskImageCommands {

    enum CancellationPoint: Sendable { case afterAttach, duringBody }
    enum Event: Sendable { case cancellable, detaching, detached }

    nonisolated let events: AsyncStream<Event>
    private let event: AsyncStream<Event>.Continuation
    private nonisolated let detach: AsyncStream<Void>
    private nonisolated let detachContinuation: AsyncStream<Void>.Continuation
    private let point: CancellationPoint
    private var folder: URL?
    private var mounted = false

    init(point: CancellationPoint) {

        self.point = point
        (events, event) = AsyncStream<Event>.makeStream()
        (detach, detachContinuation) = AsyncStream<Void>.makeStream()
    }

    func setFolder(_ folder: URL) { self.folder = folder }
    func folderExists() -> Bool { folder.map { FileManager.default.fileExists(atPath: $0.path) } ?? false }

    nonisolated func releaseDetach() {

        detachContinuation.yield(())
        detachContinuation.finish()
    }

    func run(_ executable: String, _ arguments: [String]) async throws -> CommandResult {

        #expect(executable == "/usr/bin/hdiutil")
        switch arguments.first {
        case "create": break
        case "attach":
            mounted = true
            if point == .afterAttach { try await waitForCancellation() }
        case "detach":
            #expect(mounted)
            #expect(!Task.isCancelled)
            #expect(folderExists())
            event.yield(.detaching)
            var iterator = detach.makeAsyncIterator()
            guard await iterator.next() != nil else { throw CancellationError() }
            try Task.checkCancellation()
            #expect(folderExists())
            mounted = false
            event.yield(.detached)
            event.finish()
        default: Issue.record("unexpected disk-image command")
        }
        return CommandResult(status: 0, output: "")
    }

    func body() async throws {

        #expect(point == .duringBody)
        try await waitForCancellation()
    }

    private func waitForCancellation() async throws {

        let wait = AsyncStream<Void>.makeStream()
        defer { wait.continuation.finish() }
        event.yield(.cancellable)
        for await _ in wait.stream {}
        throw CancellationError()
    }
}
