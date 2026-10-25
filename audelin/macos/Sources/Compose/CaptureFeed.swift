import CallText
import struct MicrophoneCapture.AudioPiece
import Synchronization
import struct SystemAudioCapture.AudioPiece
import TrackFile

/// Writes a capture independently of its one live audio subscription.
public final class CaptureFeed: LiveAudio, Sendable {

    private final class Position: Sendable {

        let value = Mutex(0.0)
    }

    private let position: Position
    private let audio: AsyncStream<Audio>
    private let receiving: Task<Void, any Error>
    private let writing: Task<Void, any Error>

    public var capturedThrough: Double { position.value.withLock { $0 } }

    /// Unpacks either capture's piece without assigning it another clock.
    public convenience init<Piece: Sendable>(
        stream: AsyncThrowingStream<Piece, any Error>,
        track: TrackFile,
        unpack: @escaping @Sendable (Piece) -> (samples: [Float], sampleRate: Double)
    ) {

        self.init(stream: stream, track: track, unpack: unpack, beforeWrite: { _ in })
    }

    init<Piece: Sendable>(
        stream: AsyncThrowingStream<Piece, any Error>,
        track: TrackFile,
        unpack: @escaping @Sendable (Piece) -> (samples: [Float], sampleRate: Double),
        beforeWrite: @escaping @Sendable (Audio) async throws -> Void,
        beforeInput: @escaping @Sendable () async -> Void = {},
        executor: (any TaskExecutor)? = nil
    ) {

        let captured = AsyncStream<Audio>.makeStream()
        let delivered = AsyncStream<Audio>.makeStream()
        audio = delivered.stream
        let position = Position()
        self.position = position
        let receiving = Task(executorPreference: executor) {
            defer { captured.continuation.finish() }
            await beforeInput()
            for try await piece in stream {
                let piece = unpack(piece)
                let audio = position.value.withLock { end in
                    let audio = Audio(start: end, samples: piece.samples, sampleRate: piece.sampleRate)
                    end = audio.end
                    return audio
                }
                captured.continuation.yield(audio)
            }
        }
        self.receiving = receiving
        writing = Task(executorPreference: executor) {
            defer { delivered.continuation.finish() }
            do {
                for await audio in captured.stream {
                    try Task.checkCancellation()
                    try await beforeWrite(audio)
                    try await track.write(audio.samples, sampleRate: audio.sampleRate)
                    delivered.continuation.yield(audio)
                }
                try await receiving.value
            } catch {
                receiving.cancel()
                _ = try? await receiving.value
                throw error
            }
        }
    }

    public convenience init(stream: AsyncThrowingStream<MicrophoneCapture.AudioPiece, any Error>, track: TrackFile) {

        self.init(stream: stream, track: track, unpack: { ($0.samples, $0.sampleRate) })
    }

    public convenience init(stream: AsyncThrowingStream<SystemAudioCapture.AudioPiece, any Error>, track: TrackFile) {

        self.init(stream: stream, track: track, unpack: { ($0.samples, $0.sampleRate) })
    }

    public func listen(_ receive: @escaping @Sendable (Audio) async -> Void) async {

        for await piece in audio {
            guard !Task.isCancelled else { return }
            await receive(piece)
        }
    }

    /// Joins writing and surfaces a stream or write failure. The listener
    /// drains the successfully written prefix before its subscription ends.
    public func wait() async throws {

        try await withTaskCancellationHandler {
            try await writing.value
        } onCancel: {
            self.cancel()
        }
    }

    public func cancel() {

        receiving.cancel()
        writing.cancel()
    }

    /// Ends a pending input read while preserving buffered input and writes.
    /// AsyncThrowingStream drains its buffer even when its reader is cancelled.
    func endInput() {

        receiving.cancel()
    }

    deinit {

        receiving.cancel()
        writing.cancel()
    }
}
