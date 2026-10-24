import struct CallText.Audio
import struct CallText.Text
import protocol CallText.TrackText
import LiveText

public actor TrackText: CallText.TrackText {

    public enum Failure: Error, Equatable {

        case notPrepared
        case updateFailed
        case updatesEnded
    }

    private struct Source: AudioSource {

        let stream: AsyncStream<AudioChunk>

        func audio() -> AsyncStream<AudioChunk> { stream }
    }

    private struct Listening {

        let live: LiveText
        let source: AsyncStream<AudioChunk>.Continuation
        let task: Task<Void, Never>
        let requests: AsyncStream<AsyncStream<Segments>.Continuation>.Continuation
        let reading: Task<Void, Never>

        func stop() {

            source.finish()
            requests.finish()
            reading.cancel()
            task.cancel()
            Task { await live.stop() }
        }
    }

    private let recognizer: any Recognizer
    private var listening: Listening?
    private var heardThrough = 0.0

    public init(recognizer: any Recognizer) {

        self.recognizer = recognizer
    }

    public func prepare() throws {

        try Task.checkCancellation()
        guard listening == nil else { return }
        let live = LiveText(recognizer: recognizer)
        let source = AsyncStream<AudioChunk>.makeStream()
        let task = Task { await live.listen(to: Source(stream: source.stream)) }
        let requests = AsyncStream<AsyncStream<Segments>.Continuation>.makeStream()
        // One reader owns the update iterator for the whole session. Each
        // caller waits on its own reply, so cancellation leaves LiveText intact.
        let reading = Task {
            var updates = live.updates.makeAsyncIterator()
            for await reply in requests.stream {
                if let update = await updates.next() { reply.yield(update) }
                reply.finish()
            }
        }
        listening = Listening(
            live: live, source: source.continuation, task: task,
            requests: requests.continuation, reading: reading
        )
    }

    public func hear(_ audio: Audio) async throws -> [Text] {

        try Task.checkCancellation()
        guard let listening else { throw Failure.notPrepared }
        heardThrough = audio.end
        listening.source.yield(AudioChunk(samples: audio.samples, sampleRate: audio.sampleRate))
        return try await nextUpdate()
    }

    public func finish() async throws -> [Text] {

        try Task.checkCancellation()
        guard let session = listening else { throw Failure.notPrepared }
        session.source.finish()
        defer { listening = nil }
        return try await withTaskCancellationHandler {
            do {
                let text = try await nextUpdate()
                session.requests.finish()
                await session.reading.value
                await session.task.value
                return text
            } catch {
                session.stop()
                await session.reading.value
                await session.task.value
                throw error
            }
        } onCancel: {
            session.stop()
        }
    }

    private func nextUpdate() async throws -> [Text] {

        guard let session = listening else { throw Failure.notPrepared }
        let reply = AsyncStream<Segments>.makeStream()
        session.requests.yield(reply.continuation)
        var updates = reply.stream.makeAsyncIterator()
        let update = await updates.next()
        try Task.checkCancellation()
        do {
            guard let update else { throw Failure.updatesEnded }
            guard update.ending != .failed else { throw Failure.updateFailed }
            return Self.text(from: update.all, through: heardThrough)
        } catch {
            session.stop()
            await session.reading.value
            await session.task.value
            listening = nil
            throw error
        }
    }

    deinit {

        listening?.stop()
    }

    public static func text(from segments: [Segments.Segment], through end: Double) -> [Text] {

        segments.enumerated().map { index, segment in
            Text(
                id: segment.id, start: segment.start,
                end: index + 1 < segments.count ? segments[index + 1].start : end,
                settled: segment.settled, pending: segment.pending
            )
        }
    }
}
