import Foundation
import Synchronization

public final class EffectHandler: Sendable {
    private let watch: @Sendable () async -> AsyncStream<Void>
    private let read: @Sendable () async -> Read
    private let relaunch: @Sendable () async throws -> Void
    private let terminate: @Sendable () async -> Void
    private let sleep: @Sendable (Duration) async throws -> Void
    private struct Work {
        var tasks: [UUID: Task<Void, Never>] = [:]
        var latestRead: UUID?
        var ended = false
    }
    private let work = Mutex(Work())

    public init(watch: @escaping @Sendable () async -> AsyncStream<Void>,
                read: @escaping @Sendable () async -> Read,
                relaunch: @escaping @Sendable () async throws -> Void,
                terminate: @escaping @Sendable () async -> Void,
                sleep: @escaping @Sendable (Duration) async throws -> Void) {
        self.watch = watch
        self.read = read
        self.relaunch = relaunch
        self.terminate = terminate
        self.sleep = sleep
    }

    public func handle(_ effect: Effect) -> AsyncStream<Event> {
        let id = UUID()
        return AsyncStream { output in
            work.withLock { work in
                guard !work.ended else { output.finish(); return }
                if effect == .read {
                    if let previous = work.latestRead { work.tasks[previous]?.cancel() }
                    work.latestRead = id
                }
                let task = Task {
                    await self.perform(effect, id: id, output: output)
                    output.finish()
                    self.work.withLock { $0.tasks[id] = nil }
                }
                work.tasks[id] = task
                output.onTermination = { _ in task.cancel() }
            }
        }
    }

    /// Ends the stream and quiet waits owned by this machine.
    public func end() {
        work.withLock { work in
            work.ended = true
            for task in work.tasks.values { task.cancel() }
            work.latestRead = nil
        }
    }

    private func perform(_ effect: Effect, id: UUID, output: AsyncStream<Event>.Continuation) async {
        switch effect {
        case .watch:
            let changes = await watch()
            let result = await read()
            if !Task.isCancelled { output.yield(.read(result)) }
            for await _ in changes {
                guard !Task.isCancelled else { return }
                output.yield(.bundleChanged)
            }
        case .read:
            do { try await sleep(.seconds(2)) } catch { return }
            guard isCurrentRead(id) else { return }
            let result = await read()
            work.withLock { work in
                if !Task.isCancelled, !work.ended, work.latestRead == id { output.yield(.read(result)) }
            }
        case .relaunch:
            do {
                try await relaunch()
                if !Task.isCancelled { output.yield(.relaunchStarted) }
            } catch {
                if !Task.isCancelled { output.yield(.relaunchFailed) }
            }
        case .terminate: await terminate()
        }
    }

    private func isCurrentRead(_ id: UUID) -> Bool {
        !Task.isCancelled && work.withLock { !$0.ended && $0.latestRead == id }
    }
}
