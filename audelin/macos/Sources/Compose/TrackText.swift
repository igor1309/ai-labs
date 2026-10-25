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
        let requests: AsyncStream<Reply>.Continuation
        let reading: Task<Void, Never>

        @discardableResult
        func stop() -> Task<Void, Never> {

            source.finish()
            requests.finish()
            reading.cancel()
            task.cancel()
            return Task { await live.stop() }
        }
    }

    private actor Reply {

        private var completed = false
        private var result: Segments?
        private var waiting: [Int: AsyncStream<Segments>.Continuation] = [:]
        private var nextID = 0

        func complete(_ update: Segments?) {

            result = update
            completed = true
            for continuation in waiting.values {
                if let update { continuation.yield(update) }
                continuation.finish()
            }
            waiting.removeAll()
        }

        func update() async -> Segments? {

            if completed { return result }
            let id = nextID
            nextID += 1
            let reply = AsyncStream<Segments>.makeStream()
            waiting[id] = reply.continuation
            defer { waiting[id] = nil }
            var iterator = reply.stream.makeAsyncIterator()
            return await iterator.next()
        }
    }

    private struct Accepted {

        let audio: Audio
        let reply: Reply
    }

    private let recognizer: any Recognizer
    private var listening: Listening?
    private var accepted: Accepted?

    public init(recognizer: any Recognizer) {

        self.recognizer = recognizer
    }

    public func prepare() throws {

        try Task.checkCancellation()
        guard listening == nil else { return }
        let live = LiveText(recognizer: recognizer)
        let source = AsyncStream<AudioChunk>.makeStream()
        let task = Task { await live.listen(to: Source(stream: source.stream)) }
        let requests = AsyncStream<Reply>.makeStream()
        // The session owns replies; cancelling a caller leaves its accepted
        // interval and update available when call text replays that interval.
        let reading = Task {
            var updates = live.updates.makeAsyncIterator()
            for await reply in requests.stream {
                await reply.complete(await updates.next())
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
        var lower = 0
        if let accepted {
            let text = try await nextUpdate(accepted.reply, through: accepted.audio.end)
            lower = Int(min(Double(audio.samples.count), max(
                0, ((accepted.audio.end - audio.start) * audio.sampleRate).rounded()
            )))
            if lower == audio.samples.count { return text }
        }
        let unheard = Audio(
            start: audio.start + Double(lower) / audio.sampleRate,
            samples: Array(audio.samples[lower...]), sampleRate: audio.sampleRate
        )
        let reply = Reply()
        accepted = Accepted(audio: unheard, reply: reply)
        listening.requests.yield(reply)
        listening.source.yield(AudioChunk(samples: unheard.samples, sampleRate: unheard.sampleRate))
        return try await nextUpdate(reply, through: unheard.end)
    }

    public func finish() async throws -> [Text] {

        try Task.checkCancellation()
        guard let session = listening else { throw Failure.notPrepared }
        session.source.finish()
        defer { listening = nil; accepted = nil }
        return try await withTaskCancellationHandler {
            do {
                if let accepted {
                    _ = try await nextUpdate(accepted.reply, through: accepted.audio.end)
                }
                let reply = Reply()
                session.requests.yield(reply)
                let text = try await nextUpdate(reply, through: accepted?.audio.end ?? 0)
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

    /// Ends and joins the adapter's work without publishing another text update.
    public func shutdown() async {

        guard let session = listening else { return }
        listening = nil
        accepted = nil
        await session.stop().value
        await session.reading.value
        await session.task.value
    }

    private func nextUpdate(_ reply: Reply, through end: Double) async throws -> [Text] {

        guard let session = listening else { throw Failure.notPrepared }
        let update = await reply.update()
        try Task.checkCancellation()
        do {
            guard let update else { throw Failure.updatesEnded }
            guard update.ending != .failed else { throw Failure.updateFailed }
            return Self.text(from: update.all, through: end)
        } catch {
            session.stop()
            await session.reading.value
            await session.task.value
            listening = nil
            accepted = nil
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
