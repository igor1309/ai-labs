import Composer
import Foundation
import Testing

@Suite(.timeLimit(.minutes(1)))
struct LocalVqeCleaningTests {
    @Test func lazyHeldLoadIsSharedAndReusedWithCorrectTrackRoles() async throws {
        let loader = ManagerLoader(), processed = Values<ProcessingCall>()
        let cleaning = LocalVqeCleaning(makeManager: { try await loader.make() }, process: { manager, microphone, call in
            processed.append(.init(manager: manager, microphone: microphone, call: call))
            return [Float(manager)]
        })
        #expect(await loader.calls == 0)
        let first = recording("first"), second = recording("second"), later = recording("later")
        let one = Task { try await cleaning.clean(first) }
        let two = Task { try await cleaning.clean(second) }
        await loader.started.next()
        #expect(await loader.calls == 1)
        await loader.complete(.success(42))
        #expect(try await one.value == [42])
        #expect(try await two.value == [42])
        #expect(try await cleaning.clean(later) == [42])
        #expect(await loader.calls == 1)
        #expect(Set(processed.all) == Set([first, second, later].map {
            ProcessingCall(manager: 42, microphone: $0.microphoneURL, call: $0.callURL)
        }))
    }

    @Test func failedLoadIsRetriedAndSuccessfulRetryIsKept() async throws {
        let loader = ManagerLoader(), processed = Values<Int>()
        let cleaning = LocalVqeCleaning(makeManager: { try await loader.make() }, process: { manager, _, _ in
            processed.append(manager); return [Float(manager)]
        })
        let failed = Task { try await cleaning.clean(recording("failed")) }
        await loader.started.next()
        await loader.complete(.failure(ScriptFailure.failed))
        await #expect(throws: ScriptFailure.self) { try await failed.value }
        #expect(processed.all.isEmpty)
        let retry = Task { try await cleaning.clean(recording("retry")) }
        await loader.started.next()
        #expect(await loader.calls == 2)
        await loader.complete(.success(7))
        #expect(try await retry.value == [7])
        #expect(try await cleaning.clean(recording("reuse")) == [7])
        #expect(processed.all == [7, 7])
        #expect(await loader.calls == 2)
    }

    @Test func cancelledLoadWaiterDoesNotProcessOrDiscardTheSharedManager() async throws {
        let loader = ManagerLoader(), processed = Values<Int>()
        let cleaning = LocalVqeCleaning(makeManager: { try await loader.make() }, process: { manager, _, _ in
            processed.append(manager); return [Float(manager)]
        })
        let cancelled = Task { try await cleaning.clean(recording("cancelled")) }
        await loader.started.next()
        cancelled.cancel()
        await loader.complete(.success(9))
        await #expect(throws: CancellationError.self) { try await cancelled.value }
        #expect(processed.all.isEmpty)
        #expect(try await cleaning.clean(recording("later")) == [9])
        #expect(await loader.calls == 1)
    }
}

private struct ProcessingCall: Hashable, Sendable {
    let manager: Int
    let microphone: URL
    let call: URL
}

private func recording(_ name: String) -> CleanupRecording {
    .init(microphoneURL: URL(fileURLWithPath: "/\(name)/microphone.caf"),
          callURL: URL(fileURLWithPath: "/\(name)/call.caf"))
}

private actor ManagerLoader {
    nonisolated let started = Signal()
    private(set) var calls = 0
    private var continuation: CheckedContinuation<Int, any Error>?
    func make() async throws -> Int {
        calls += 1
        return try await withCheckedThrowingContinuation { continuation in
            self.continuation = continuation
            started.send()
        }
    }
    func complete(_ result: Result<Int, any Error>) {
        continuation?.resume(with: result)
        continuation = nil
    }
    deinit { started.end() }
}
