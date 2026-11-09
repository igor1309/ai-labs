import Foundation
import Synchronization
import Testing
@testable import Audelin
@testable import Composer

/// A feed delivers to and ends its subscribers with its lock free: a reader
/// cancelled while it is resumed would otherwise deadlock the two (LAB-902).
@Suite(.timeLimit(.minutes(1)))
struct StateFeedTests {

    @Test func theAccessFeedDeliversAndEndsOutsideItsLock() {
        let feed = Audelin.StateFeed<Int>()
        let calls = LockCalls { feed.subscribers.withLockIfAvailable { _ in true } ?? false }
        _ = feed.register(.init(deliver: calls.deliver, end: calls.end))
        feed.publish(1)
        feed.finish()
        #expect(calls.seen == ["deliver 1": true, "end": true])
    }

    @Test func theCompositionFeedDeliversAndEndsOutsideItsLock() {
        let feed = Composer.StateFeed<Int>()
        let calls = LockCalls { feed.subscribers.withLockIfAvailable { _ in true } ?? false }
        _ = feed.register(.init(deliver: calls.deliver, end: calls.end))
        feed.publish(1)
        feed.finish()
        #expect(calls.seen == ["deliver 1": true, "end": true])
    }

    @Test func aReaderGetsTheCurrentStateThenEachChangeUntilTheFeedFinishes() async {
        let feed = Composer.StateFeed<Int>()
        var states = feed.subscribe(from: 0).makeAsyncIterator()
        feed.publish(1)
        feed.finish()
        #expect(await states.next() == 0)
        #expect(await states.next() == 1)
        #expect(await states.next() == nil)
        var late = feed.subscribe(from: 2).makeAsyncIterator()
        #expect(await late.next() == 2)
        #expect(await late.next() == nil)
    }

    @Test func aCancelledReaderIsRemoved() async {
        let feed = Composer.StateFeed<Int>()
        let reader = Task { for await _ in feed.subscribe(from: 0) {} }
        while feed.subscribers.withLock({ $0.all.isEmpty }) { await Task.yield() }
        reader.cancel()
        await reader.value
        #expect(feed.subscribers.withLock { $0.all.isEmpty })
    }
}

/// A subscriber's calls, each with whether the feed's lock was free during it.
/// The lock is tried from another thread: trying it on the thread holding it traps.
private final class LockCalls: Sendable {

    private let isFree: @Sendable () -> Bool
    private let calls = Mutex<[String: Bool]>([:])
    init(isFree: @escaping @Sendable () -> Bool) { self.isFree = isFree }

    var seen: [String: Bool] { calls.withLock { $0 } }
    func deliver(_ state: Int) { record("deliver \(state)") }
    func end() { record("end") }

    private func record(_ call: String) {
        let tried = DispatchSemaphore(value: 0)
        Thread { [self] in
            let free = isFree()
            calls.withLock { $0[call] = free }
            tried.signal()
        }.start()
        tried.wait()
    }
}
