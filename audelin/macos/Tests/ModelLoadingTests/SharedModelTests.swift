import ModelLoading
import Testing

struct SharedModelTests {

    @Test func concurrentBuildsShareOneLoad() async throws {

        let fake = ControlledLoad()
        let model = SharedModel { try await fake.load() }
        let (waiting, ready) = AsyncStream<Void>.makeStream()
        let callers = 8

        let values = try await withThrowingTaskGroup(of: Int.self) { group in
            for _ in 0..<callers {
                group.addTask {
                    let loading = await model.load()
                    ready.yield(())
                    return try await loading.value
                }
            }
            var arrivals = waiting.makeAsyncIterator()
            for _ in 0..<callers { await arrivals.next() }
            ready.finish()
            var starts = fake.started.makeAsyncIterator()
            await starts.next()

            await fake.finish(.success(42))
            var values: [Int] = []
            for try await value in group { values.append(value) }
            return values
        }

        #expect(values == Array(repeating: 42, count: callers))
        #expect(await fake.calls == 1)
        #expect(try await model.load().value == 42)
        #expect(await fake.calls == 1)
    }

    @Test func aFailedLoadIsRetriedByTheNextBuild() async {

        let fake = FailingOnceLoad()
        let model = SharedModel { try await fake.load() }

        await #expect(throws: LoadFailed.self) { try await model.load().value }
        let retry = await model.load().result

        #expect((try? retry.get()) == 42)
        #expect(await fake.calls == 2)
    }
}

private struct LoadFailed: Error {}

private actor ControlledLoad {

    let started: AsyncStream<Void>
    private let starts: AsyncStream<Void>.Continuation
    private var result: Result<Int, LoadFailed>?
    private var waiters: [CheckedContinuation<Int, Error>] = []
    private(set) var calls = 0

    init() {

        (started, starts) = AsyncStream<Void>.makeStream()
    }

    func load() async throws -> Int {

        calls += 1
        starts.yield(())
        if let result { return try result.get() }
        return try await withCheckedThrowingContinuation { waiters.append($0) }
    }

    func finish(_ result: Result<Int, LoadFailed>) {

        self.result = result
        for waiter in waiters { waiter.resume(with: result.mapError { $0 as Error }) }
        waiters.removeAll()
        starts.finish()
    }
}

private actor FailingOnceLoad {

    private(set) var calls = 0

    func load() throws -> Int {

        calls += 1
        if calls == 1 { throw LoadFailed() }
        return 42
    }
}
