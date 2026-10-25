import protocol LiveAudio.Capture
import struct LiveAudio.AudioPiece
import protocol RecordedCapture.Capture
import protocol RecordedCapture.Track
import struct RecordedCapture.AudioPiece
import enum RecordedCapture.Failure
import TrackFile

typealias CapturedPiece = LiveAudio.AudioPiece
typealias RecordingTrack = RecordedCapture.Track
typealias RecordingFailure = RecordedCapture.Failure

/// Bridges live audio's capture contract to the recording reader's contract.
actor RecordedInput: RecordedCapture.Capture {

    private let capture: any LiveAudio.Capture
    private var translating: Task<Void, Never>?

    init(capture: any LiveAudio.Capture) {

        self.capture = capture
    }

    func start() async throws -> AsyncThrowingStream<RecordedCapture.AudioPiece, any Error> {

        let stream = try await capture.start()
        let output = AsyncThrowingStream<RecordedCapture.AudioPiece, any Error>.makeStream()
        let translating = Task {
            do {
                for try await piece in stream {
                    output.continuation.yield(.init(samples: piece.samples, sampleRate: piece.sampleRate))
                }
                output.continuation.finish()
            } catch { output.continuation.finish(throwing: error) }
        }
        self.translating = translating
        output.continuation.onTermination = { _ in translating.cancel() }
        return output.stream
    }

    func stop() async throws {

        do { try await capture.stop() }
        catch {
            translating?.cancel()
            await translating?.value
            throw error
        }
        await translating?.value
    }
}

/// Translates a concrete capture's pieces and joins the translation on stop.
actor CaptureAdapter<Piece: Sendable>: LiveAudio.Capture {

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
                for try await piece in started.stream {
                    let piece = unpack(piece)
                    output.continuation.yield(piece)
                }
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
