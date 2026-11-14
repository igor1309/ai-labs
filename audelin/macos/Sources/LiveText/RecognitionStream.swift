/// Hears one track's audio, interval by interval, and keeps its text as final
/// segments followed by a live tail. Each interval's update from the
/// recogniser is applied to the text once.
public actor RecognitionStream {

    /// An interval of the track's audio, mono.
    public struct Audio: Equatable, Sendable {

        /// Seconds into the track where the first sample starts.
        public var start: Double
        public var samples: [Float]
        public var sampleRate: Double

        public init(start: Double, samples: [Float], sampleRate: Double) {

            self.start = start
            self.samples = samples
            self.sampleRate = sampleRate
        }

        var end: Double { start + Double(samples.count) / sampleRate }
    }

    /// A segment of the text, running from its first word to the next
    /// segment's start, or for the last segment to the end of what is heard.
    public struct Segment: Equatable, Sendable {

        public var id: Int
        public var start: Double
        public var end: Double
        public var words: [Word]
        /// How many words, from the first, will not change any more.
        public var settledCount: Int

        public init(id: Int, start: Double, end: Double, words: [Word], settledCount: Int) {

            self.id = id
            self.start = start
            self.end = end
            self.words = words
            self.settledCount = settledCount
        }
    }

    public struct Update: Equatable, Sendable {

        /// Segments that will never change again.
        public var final: [Segment]
        public var tail: [Segment]
        /// No text still to come starts before this.
        public var noTextBefore: Double?

        public init(final: [Segment], tail: [Segment], noTextBefore: Double? = nil) {

            self.final = final
            self.tail = tail
            self.noTextBefore = noTextBefore
        }
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

        func join() async {

            await reading.value
            await task.value
        }
    }

    /// The recogniser's update for one interval, kept by the stream rather
    /// than by the caller waiting for it.
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

    private let recognizerSource: @Sendable () async throws -> any Recognizer
    private var listening: Listening?
    private var finalText: [Segment] = []
    private var tail: [Segment] = []
    private var noTextBefore: Double?

    public init(recognizerSource: @escaping @Sendable () async throws -> any Recognizer) {

        self.recognizerSource = recognizerSource
    }

    /// Loads the recogniser and starts a session with no text.
    public func prepare() async throws {

        try Task.checkCancellation()
        guard listening == nil else { return }
        let recognizer = try await recognizerSource()
        try Task.checkCancellation()
        guard listening == nil else { return }
        finalText = []
        tail = []
        noTextBefore = nil
        let live = LiveText(recognizer: recognizer)
        let source = AsyncStream<AudioChunk>.makeStream()
        let task = Task { @concurrent in await live.listen(to: Source(stream: source.stream)) }
        let requests = AsyncStream<Reply>.makeStream()
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

    /// Hears the next interval and returns the text so far.
    public func hear(_ audio: Audio) async throws -> Update {

        try Task.checkCancellation()
        guard let listening else { throw Failure.notPrepared }
        let reply = Reply()
        listening.requests.yield(reply)
        listening.source.yield(AudioChunk(samples: audio.samples, sampleRate: audio.sampleRate))
        return try await nextUpdate(reply)
    }

    /// Hears the rest, ends the session and returns its last text.
    public func finish() async throws -> Update {

        try Task.checkCancellation()
        guard let session = listening else { throw Failure.notPrepared }
        session.source.finish()
        defer { listening = nil }
        return try await withTaskCancellationHandler {
            do {
                let reply = Reply()
                session.requests.yield(reply)
                let text = try await nextUpdate(reply)
                session.requests.finish()
                await session.join()
                return text
            } catch {
                session.stop()
                await session.join()
                throw error
            }
        } onCancel: {
            session.stop()
        }
    }

    /// Ends and joins the session's work without another update.
    public func shutdown() async {

        guard let session = listening else { return }
        listening = nil
        await session.stop().value
        await session.join()
    }

    private func nextUpdate(_ reply: Reply) async throws -> Update {

        guard let session = listening else { throw Failure.notPrepared }
        let update = await reply.update()
        try Task.checkCancellation()
        do {
            guard let update else { throw Failure.updatesEnded }
            guard update.ending != .failed else { throw Failure.updateFailed }
            try apply(update)
            return Update(final: finalText, tail: tail, noTextBefore: noTextBefore)
        } catch {
            session.stop()
            await session.join()
            listening = nil
            throw error
        }
    }

    private func apply(_ update: LiveText.Update) throws {

        guard update.from == finalText.count,
              update.finalCount >= update.from,
              update.finalCount <= update.from + update.segments.count else {
            throw Failure.updateGap
        }
        let mapped = Self.segments(update.segments, through: update.end)
        let newlyFinal = update.finalCount - update.from
        if newlyFinal > 0 { finalText.append(contentsOf: mapped.prefix(newlyFinal)) }
        tail = Array(mapped.dropFirst(newlyFinal))
        noTextBefore = update.noWordBefore
    }

    deinit {

        listening?.stop()
    }

    /// A segment runs to the next one's start, and the last to `end`.
    static func segments(_ segments: [Segments.Segment], through end: Double) -> [Segment] {

        segments.indices.map { index in
            let segment = segments[index]
            return Segment(
                id: segment.id, start: segment.start,
                end: index + 1 < segments.count ? segments[index + 1].start : end,
                words: segment.words, settledCount: segment.settledCount
            )
        }
    }
}
