final class StreamSpy<Element: Sendable & Equatable>: @unchecked Sendable {

    private(set) var values = [Element]()
    private(set) var isFinished = false
    private var task: Task<Void, Never>?

    init(_ stream: AsyncStream<Element>) {
        task = Task { [weak self] in
            for await value in stream {
                self?.values.append(value)
            }
            self?.isFinished = true
        }
    }

    func waitForFinish(timeout: Duration = .seconds(2)) async {
        let deadline = ContinuousClock.now + timeout
        while !isFinished, ContinuousClock.now < deadline {
            await Task.yield()
        }
    }

    func waitForEvents(_ count: Int, timeout: Duration = .seconds(2)) async {
        let deadline = ContinuousClock.now + timeout
        while values.count < count, ContinuousClock.now < deadline {
            await Task.yield()
        }
    }

    deinit { task?.cancel() }
}
