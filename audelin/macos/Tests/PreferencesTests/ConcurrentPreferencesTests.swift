import BlockingTestWork
import Foundation
import Dispatch
import Preferences
import Testing

@Suite(.timeLimit(.minutes(1)))
struct ConcurrentPreferencesTests {
    @Test func recordingEditPreservesAnInFlightNotesOptOut() async throws {
        let root = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        let pipe = await offPool { Pipe() }
        let held = AsyncStream<Void>.makeStream()
        let contended = AsyncStream<Void>.makeStream()
        let file = root.appendingPathComponent("preferences.json")
        try await withCleanup {
            let store = await offPool { PreferencesStore(fileURL: file, replace: { data, url in
                #expect(!Thread.isMainThread)
                if !(try JSONDecoder().decode(Preferences.self, from: data)).notes.enabled {
                    held.continuation.yield(())
                    _ = try pipe.fileHandleForReading.read(upToCount: 1)
                }
                try data.write(to: url, options: .atomic)
            }, recordingContended: { contended.continuation.yield(()) }) }
            var initial = Preferences(); initial.notes.enabled = true
            let enabled = initial
            try await offPool { try store.write(enabled) }
            var notes = initial.notes; notes.enabled = false
            let disabled = notes
            let saving = Task { try await independentQueue { try store.updateNotes(disabled) } }
            var iterator = held.stream.makeAsyncIterator()
            await iterator.next()
            let editing = Task { try await store.updateRecording(automatic: false, liveText: false) }
            var contention = contended.stream.makeAsyncIterator()
            await contention.next()
            // Release both writes; subsequent writes must also be able to pass the fixture.
            await offPool { try? pipe.fileHandleForWriting.write(contentsOf: Data([1, 1])) }
            try await saving.value
            let result = try await editing.value
            #expect(!result.notes.enabled)
            #expect(!result.automaticRecording && !result.liveText)
            #expect(try await offPool { try store.loadNotes() } == disabled)
        } cleanup: {
            held.continuation.finish()
            contended.continuation.finish()
            try pipe.fileHandleForReading.close(); try pipe.fileHandleForWriting.close()
            try FileManager.default.removeItem(at: root)
        }
    }
}
private func independentQueue<T: Sendable>(_ body: @escaping @Sendable () throws -> T) async throws -> T {
    try await withCheckedThrowingContinuation { continuation in
        DispatchQueue(label: "preferences.concurrent-test").async {
            continuation.resume(with: Result { try body() })
        }
    }
}
