import Testing
@testable import Audelin
@testable import Composer

/// Subscribers that end while states are published: each ending removes its
/// subscriber under the feed's lock from inside the stream's own.
@Suite(.timeLimit(.minutes(1)))
struct StateFeedTests {

    @Test func accessSubscribersCanEndWhileStatesArePublished() async {
        let feed = Audelin.StateFeed<Int>()
        await endSubscribers(subscribe: { feed.subscribe(from: 0) }, publish: { feed.publish($0) })
        feed.finish()
        #expect(feed.finished)
    }

    @Test func compositionSubscribersCanEndWhileStatesArePublished() async {
        let feed = Composer.StateFeed<Int>()
        await endSubscribers(subscribe: { feed.subscribe(from: 0) }, publish: { feed.publish($0) })
        feed.finish()
        #expect(feed.finished)
    }
}

/// Publishes on its own thread while readers, each suspended waiting for
/// the next state, are cancelled: a cancelled task runs its stream's ending
/// holding its own lock, as publishing resumes it.
private func endSubscribers(
    subscribe: @escaping @Sendable () -> AsyncStream<Int>,
    publish: @escaping @Sendable (Int) -> Void
) async {
    let publishing = Task.detached {
        var state = 0
        while !Task.isCancelled {
            state += 1
            publish(state)
        }
    }
    for _ in 0..<5_000 {
        let (waiting, waited) = AsyncStream<Void>.makeStream()
        let reader = Task.detached {
            var states = subscribe().makeAsyncIterator()
            _ = await states.next()
            waited.yield()
            while await states.next() != nil {}
        }
        var started = waiting.makeAsyncIterator()
        _ = await started.next()
        reader.cancel()
        await reader.value
    }
    publishing.cancel()
    await publishing.value
}
