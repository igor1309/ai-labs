/// Turns what a recogniser hears on one track into segments of settled and
/// pending words.
public actor LiveText {

    /// The segments after each change, ending when Live text does.
    public nonisolated let updates: AsyncStream<Segments>

    private let recognizer: any Recognizer
    private let continuation: AsyncStream<Segments>.Continuation
    private var segments: Segments
    private var feeding: Task<Void, any Error>?
    private var stopped = false

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
        continuation.yield(segments)
        continuation.finish()
    }

    /// Stops listening and keeps the text so far.
    public func stop() {

        stopped = true
        feeding?.cancel()
    }

    private func feed(from source: any AudioSource) async throws {

        for await chunk in source.audio() {
            segments.hear(try await recognizer.hear(chunk))
            continuation.yield(segments)
        }
    }
}
