import Composer
import LiveText
import Synchronization
import Testing
@testable import Audelin

@Suite(.timeLimit(.minutes(1)))
struct ModelLoadingTests {

    @Test func loadingLogsItsStartAndFinish() async throws {

        let sink = EntrySpy()
        try await loadModel(recognizerSource: { SilentRecognizer() }, sink: sink).value
        #expect(sink.entries == [
            .init(category: .model, message: "load started"), .init(category: .model, message: "load finished"),
        ])
    }

    @Test func aFailedLoadLogsAndRethrowsTheSameError() async {

        let sink = EntrySpy(), failure = LoadFailure()
        do {
            try await loadModel(recognizerSource: { throw failure }, sink: sink).value
            Issue.record("load must fail")
        } catch { #expect((error as? LoadFailure) === failure) }
        #expect(sink.entries == [
            .init(category: .model, message: "load started"),
            .init(category: .model, message: "load failed", error: "sentinel failure"),
        ])
    }

    @Test func launchStartsLoadingWithoutWaiting() async throws {

        let began = AsyncStream<Void>.makeStream(), release = AsyncStream<Void>.makeStream()
        let loading = loadModel(recognizerSource: {
            began.continuation.yield(())
            for await _ in release.stream {}
            return SilentRecognizer()
        }, sink: EntrySpy())
        defer { release.continuation.finish(); loading.cancel() }
        var beginning = began.stream.makeAsyncIterator()
        _ = await beginning.next()
        release.continuation.finish()
        try await loading.value
    }
}

private final class EntrySpy: LogSink {
    private let stored = Mutex<[LogEntry]>([])
    var entries: [LogEntry] { stored.withLock { $0 } }
    func write(_ entry: LogEntry) { stored.withLock { $0.append(entry) } }
}

private final class LoadFailure: Error, CustomStringConvertible {
    var description: String { "sentinel failure" }
}

private struct SilentRecognizer: Recognizer {
    func hear(_ chunk: AudioChunk) async throws -> Hearing { Hearing(words: []) }
    func finish() async throws -> Hearing { Hearing(words: []) }
}
