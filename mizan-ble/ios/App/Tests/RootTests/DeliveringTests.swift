@testable import Root
import Testing

@MainActor
struct DeliveringTests {
    @Test(arguments: [7, 42])
    func syncHandlerRunsBeforeTheStreamIsReturnedAndDeliversExactlyItsEvent(effect: Int) async throws {
        var handled: [Int] = []
        let stream = delivering { (effect: Int) -> String in
            handled.append(effect)
            return "\(effect)"
        }(effect)

        #expect(handled == [effect])
        #expect(try await collect(stream) == ["\(effect)"])
    }
}

/// Collects the whole stream, so a stream that never finishes fails instead of passing on its first event.
private func collect(_ stream: AsyncStream<String>) async throws -> [String] {
    try await withThrowingTaskGroup(of: [String]?.self) { group in
        group.addTask {
            var values: [String] = []
            for await value in stream { values.append(value) }
            return values
        }
        group.addTask {
            try await Task.sleep(for: .seconds(5))
            return nil
        }
        let first = try await group.next() ?? nil
        group.cancelAll()
        return try #require(first, "the stream did not finish")
    }
}
