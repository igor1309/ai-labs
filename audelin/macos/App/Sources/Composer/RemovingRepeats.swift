extension AsyncSequence where Element: Equatable, Self: Sendable {

    /// The same elements, without any that equal the one before.
    func removingRepeats() -> RemovingRepeats<Self> { RemovingRepeats(base: self) }
}

struct RemovingRepeats<Base: AsyncSequence & Sendable>: AsyncSequence, Sendable where Base.Element: Equatable {

    let base: Base

    struct AsyncIterator: AsyncIteratorProtocol {

        var base: Base.AsyncIterator
        var last: Base.Element?

        mutating func next(isolation actor: isolated (any Actor)?) async throws(Base.Failure) -> Base.Element? {

            while let element = try await base.next(isolation: actor) {
                guard element != last else { continue }
                last = element
                return element
            }
            return nil
        }
    }

    func makeAsyncIterator() -> AsyncIterator { AsyncIterator(base: base.makeAsyncIterator()) }
}
