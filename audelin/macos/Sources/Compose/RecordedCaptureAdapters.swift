import RecordedCapture
import TrackFile

typealias CapturedPiece = AudioPiece
typealias RecordingTrack = Track
typealias RecordingFailure = Failure

/// Translates a concrete capture's pieces and joins the translation on stop.
actor CaptureAdapter<Piece: Sendable>: Capture {

    let begin: @Sendable () async throws -> StartedCapture<Piece>
    let unpack: @Sendable (Piece) -> CapturedPiece
    private var started: StartedCapture<Piece>?
    private var translating: Task<Void, Never>?

    init(
        begin: @escaping @Sendable () async throws -> StartedCapture<Piece>,
        unpack: @escaping @Sendable (Piece) -> CapturedPiece
    ) {

        self.begin = begin
        self.unpack = unpack
    }

    func start() async throws -> AsyncThrowingStream<CapturedPiece, any Error> {

        let started = try await begin()
        self.started = started
        let output = AsyncThrowingStream<CapturedPiece, any Error>.makeStream()
        let unpack = unpack
        let translating = Task {
            do {
                for try await piece in started.stream { output.continuation.yield(unpack(piece)) }
                output.continuation.finish()
            } catch { output.continuation.finish(throwing: error) }
        }
        self.translating = translating
        output.continuation.onTermination = { _ in translating.cancel() }
        return output.stream
    }

    func stop() async throws {

        do { try await started?.stop() }
        catch {
            // A failed stop quiesces production but may leave the source open.
            // Cancellation drains its buffered pieces before ending translation.
            translating?.cancel()
            await translating?.value
            throw error
        }
        await translating?.value
    }
}

struct CaptureTrack: RecordingTrack {

    let track: TrackFile

    func write(_ samples: [Float], sampleRate: Double) async throws {

        try await track.write(samples, sampleRate: sampleRate)
    }
}
