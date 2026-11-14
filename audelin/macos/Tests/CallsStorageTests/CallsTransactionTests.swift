import CallsStorage
import Foundation
import Testing

@Suite(.timeLimit(.minutes(1))) struct CallsTransactionTests {
    private let id = "1970.01.01-0000"

    private func first(_ count: Int, of stream: AsyncStream<CallsTransaction>) async -> [CallsTransaction] {
        var values: [CallsTransaction] = []
        for await value in stream {
            values.append(value)
            if values.count == count { break }
        }
        return values
    }
    private func withCall(_ body: (CallsStorage, URL) async throws -> Void) async throws {
        try await withStorageFolder { root in
            let source = root.appendingPathComponent("source"), destination = root.appendingPathComponent("destination")
            try FileManager.default.createDirectory(at: source.appendingPathComponent(id), withIntermediateDirectories: true)
            try FileManager.default.createDirectory(at: destination, withIntermediateDirectories: true)
            try await body(makeStorage(folder: source), destination)
        }
    }

    @Test func idleAtStart() async throws {
        try await withCall { storage, _ in
            #expect(await first(1, of: storage.transactions()) == [.idle])
        }
    }

    @Test func moveRunsThenEndsIdle() async throws {
        try await withCall { storage, destination in
            let states = storage.transactions()
            _ = try await storage.move(id: id, to: destination)
            #expect(await first(3, of: states) == [.idle, .running, .idle])
        }
    }

    @Test func failedMoveEndsIdle() async throws {
        try await withCall { storage, destination in
            let states = storage.transactions()
            await #expect(throws: (any Error).self) { _ = try await storage.move(id: "1970.01.01-0001", to: destination) }
            #expect(await first(3, of: states) == [.idle, .running, .idle])
        }
    }

    @Test func commitRunsThenEndsIdleOnSuccessAndFailure() async throws {
        try await withCall { storage, destination in
            let states = storage.transactions()
            _ = try await storage.move(id: id, to: destination)
            await #expect(throws: ScriptFailure.failed) { try await storage.commitFolder(destination) { throw ScriptFailure.failed } }
            try await storage.commitFolder(destination) {}
            #expect(await first(7, of: states) == [.idle, .running, .idle, .running, .idle, .running, .idle])
        }
    }

    @Test func listingIsNotATransaction() async throws {
        try await withCall { storage, destination in
            let states = storage.transactions()
            _ = try await storage.list()
            _ = try await storage.prepareMove(to: destination)
            _ = try await storage.move(id: id, to: destination)
            #expect(await first(3, of: states) == [.idle, .running, .idle])
        }
    }
}
