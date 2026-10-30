/// Turns what a recogniser hears on one track into segments of settled and
/// pending words.
public actor LiveText {

    public struct Update: Equatable, Sendable {

        /// Replace the retained segments from this index onward.
        public let from: Int
        /// Segments before this count will never change again.
        public let finalCount: Int
        /// Newly final segments followed by the live tail. Owns its storage
        /// so retaining an update does not copy the call on the next hearing.
        public let segments: [Segments.Segment]
        public let end: Double
        public let ending: Segments.Ending?
    }

    /// Ordered, lossless updates starting at the previous final count.
    public nonisolated let updates: AsyncStream<Update>

    private let recognizer: any Recognizer
    private let continuation: AsyncStream<Update>.Continuation
    private var segments: Segments
    private var feeding: Task<Void, any Error>?
    private var stopped = false
    private var reportedFinalCount = 0

    /// A pause is 2 s: longer than the recogniser's word times leave between
    /// words of one sentence.
    public init(recognizer: any Recognizer, pause: Double = 2) {

        self.recognizer = recognizer
        self.segments = Segments(pause: pause)
        (updates, continuation) = AsyncStream.makeStream()
    }

    /// Listens until the audio ends, the client stops it, or the recogniser
    /// fails.
    public func listen(to source: any AudioSource) async {

        let feeding = Task { try await feed(from: source) }
        self.feeding = feeding
        if stopped { feeding.cancel() }

        do {
            do { try await feeding.value } catch where stopped {}
            segments.finish(try await recognizer.finish())
        } catch {
            segments.fail()
        }
        publish()
        continuation.finish()
    }

    /// Stops listening and keeps the text so far.
    public func stop() {

        stopped = true
        feeding?.cancel()
    }

    private func publish() {

        continuation.yield(Update(
            from: reportedFinalCount, finalCount: segments.finalCount,
            segments: segments.all[reportedFinalCount...].map { $0 },
            end: segments.end, ending: segments.ending
        ))
        reportedFinalCount = segments.finalCount
    }

    private func feed(from source: any AudioSource) async throws {

        for await chunk in source.audio() {
            segments.hear(try await recognizer.hear(chunk))
            publish()
        }
    }
}
