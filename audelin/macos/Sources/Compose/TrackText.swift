import struct SideText.Audio
import struct SideText.Text
import LiveText

public actor TrackText {

    public struct Update: Equatable, Sendable {

        public let final: [Text]
        public let tail: [Text]
        /// No text still to come starts before this.
        public var noTextBefore: Double? = nil

        /// The downstream text stores still consume whole-call snapshots.
        public var all: [Text] { final + tail }
    }

    public enum Failure: Error, Equatable {

        case notPrepared
        case updateFailed
        case updatesEnded
        case updateGap
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
            return Task { @concurrent in await live.stop() }
        }
    }

    private actor Reply {

        private var completed = false
        private var result: LiveText.Update?
        private var waiting: [Int: AsyncStream<LiveText.Update>.Continuation] = [:]
        private var nextID = 0

        func complete(_ update: LiveText.Update?) {

            result = update
            completed = true
            for continuation in waiting.values {
                if let update { continuation.yield(update) }
                continuation.finish()
            }
            waiting.removeAll()
        }

        func update() async -> LiveText.Update? {

            if completed { return result }
            let id = nextID
            nextID += 1
            let reply = AsyncStream<LiveText.Update>.makeStream()
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

    private actor RecognizerReply {

        private var result: Result<any Recognizer, any Error>?
        private var waiting: [Int: AsyncStream<Result<any Recognizer, any Error>>.Continuation] = [:]
        private var nextID = 0

        func complete(_ result: Result<any Recognizer, any Error>) {

            self.result = result
            for continuation in waiting.values {
                continuation.yield(result)
                continuation.finish()
            }
            waiting.removeAll()
        }

        func recognizer() async throws -> any Recognizer {

            try Task.checkCancellation()
            if let result { return try result.get() }
            let id = nextID
            nextID += 1
            let reply = AsyncStream<Result<any Recognizer, any Error>>.makeStream()
            waiting[id] = reply.continuation
            defer { waiting[id] = nil }
            var iterator = reply.stream.makeAsyncIterator()
            let result = await iterator.next()
            try Task.checkCancellation()
            guard let result else { throw CancellationError() }
            return try result.get()
        }
    }

    private let recognizerSource: @Sendable () async throws -> any Recognizer
    private var loading: (reply: RecognizerReply, task: Task<Void, Never>)?
    private var listening: Listening?
    private var accepted: Accepted?
    private var finalText: [Text] = []
    private var tail: [Text] = []
    private var noTextBefore: Double?
    private var appliedReply: Reply?

    public init(recognizerSource: @escaping @Sendable () async throws -> any Recognizer) {

        self.recognizerSource = recognizerSource
    }

    public func prepare() async throws {

        try Task.checkCancellation()
        guard listening == nil else { return }
        if loading == nil {
            let reply = RecognizerReply(), source = recognizerSource
            // A cancelled prepare ends only its wait; another prepare can use
            // the same load even when the source does not honor cancellation.
            let task = Task { @concurrent in
                do { await reply.complete(.success(try await source())) }
                catch { await reply.complete(.failure(error)) }
            }
            loading = (reply, task)
        }
        let recognizer = try await loading!.reply.recognizer()
        try Task.checkCancellation()
        guard listening == nil else { return }
        finalText = []
        tail = []
        appliedReply = nil
        let live = LiveText(recognizer: recognizer)
        let source = AsyncStream<AudioChunk>.makeStream()
        let task = Task { @concurrent in await live.listen(to: Source(stream: source.stream)) }
        let requests = AsyncStream<Reply>.makeStream()
        // The session owns replies; cancelling a caller leaves its accepted
        // interval and update available when side text replays that interval.
        let reading = Task { @concurrent in
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

    public func hear(_ audio: Audio) async throws -> Update {

        try Task.checkCancellation()
        guard let listening else { throw Failure.notPrepared }
        var lower = 0
        if let accepted {
            let text = try await nextUpdate(accepted.reply)
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
        return try await nextUpdate(reply)
    }

    public func finish() async throws -> Update {

        try Task.checkCancellation()
        guard let session = listening else { throw Failure.notPrepared }
        session.source.finish()
        defer { listening = nil; accepted = nil }
        return try await withTaskCancellationHandler {
            do {
                if let accepted {
                    _ = try await nextUpdate(accepted.reply)
                }
                let reply = Reply()
                session.requests.yield(reply)
                let text = try await nextUpdate(reply)
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

    private func nextUpdate(_ reply: Reply) async throws -> Update {

        guard let session = listening else { throw Failure.notPrepared }
        let update = await reply.update()
        try Task.checkCancellation()
        do {
            guard let update else { throw Failure.updatesEnded }
            guard update.ending != .failed else { throw Failure.updateFailed }
            // An accepted interval is read again before the next one and
            // after a cancelled wait. Its delta must be applied only once.
            if appliedReply !== reply {
                guard update.from == finalText.count,
                      update.finalCount >= update.from,
                      update.finalCount <= update.from + update.segments.count else {
                    throw Failure.updateGap
                }
                let mapped = update.segments.enumerated().map { index, segment in
                    Self.text(segment, index + 1 < update.segments.count ? update.segments[index + 1].start : update.end)
                }
                let newlyFinal = update.finalCount - update.from
                if newlyFinal > 0 { finalText.append(contentsOf: mapped.prefix(newlyFinal)) }
                tail = Array(mapped.dropFirst(newlyFinal))
                noTextBefore = update.noWordBefore
                appliedReply = reply
            }
            return Update(final: finalText, tail: tail, noTextBefore: noTextBefore)
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

        loading?.task.cancel()
        listening?.stop()
    }

    /// A segment runs to the next one's start, and the last to `end`.
    public static func text(from segments: [Segments.Segment], through end: Double) -> [Text] {

        segments.enumerated().map { index, segment in
            text(segment, index + 1 < segments.count ? segments[index + 1].start : end)
        }
    }

    private static func text(_ segment: Segments.Segment, _ end: Double) -> Text {

        Text(id: segment.id, start: segment.start, end: end, settled: segment.settled, pending: segment.pending)
    }
}
