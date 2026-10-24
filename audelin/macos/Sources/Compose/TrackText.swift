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
        var updates: AsyncStream<Segments>.Iterator
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
        listening = Listening(live: live, source: source.continuation, task: task, updates: live.updates.makeAsyncIterator())
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
        guard let listening else { throw Failure.notPrepared }
        listening.source.finish()
        defer { self.listening = nil }
        let text = try await nextUpdate()
        await listening.task.value
        return text
    }

    private func nextUpdate() async throws -> [Text] {

        guard var session = listening else { throw Failure.notPrepared }
        let update = await withTaskCancellationHandler {
            await session.updates.next()
        } onCancel: { [live = session.live, source = session.source, task = session.task] in
            source.finish()
            task.cancel()
            Task { await live.stop() }
        }
        listening = session
        do {
            try Task.checkCancellation()
            guard let update else { throw Failure.updatesEnded }
            guard update.ending != .failed else { throw Failure.updateFailed }
            return Self.text(from: update.all, through: heardThrough)
        } catch {
            session.source.finish()
            await session.live.stop()
            await session.task.value
            listening = nil
            throw error
        }
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
