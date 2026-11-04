import Composer

protocol CapturePiece: Sendable {

    var samples: [Float] { get }
    var sampleRate: Double { get }
}

protocol AudioCapture: Sendable {

    associatedtype Piece: CapturePiece

    var audio: AsyncThrowingStream<Piece, any Error> { get }
    /// Idempotent: ending the stream and the caller's stop may both call it.
    func stop()
}

/// Maps a started capture's pieces. A source error reaches the consumer; a
/// consumer ending the stream stops the capture and cancels the source.
func startedCapture<Capture: AudioCapture>(_ capture: Capture) -> StartedCapture<CaptureBuffer> {

    let source = capture.audio
    let stream = AsyncThrowingStream<CaptureBuffer, any Error> { output in
        let task = Task {
            do {
                for try await piece in source {
                    output.yield(CaptureBuffer(samples: piece.samples, sampleRate: piece.sampleRate))
                }
                output.finish()
            } catch { output.finish(throwing: error) }
        }
        output.onTermination = { _ in
            task.cancel()
            capture.stop()
        }
    }
    return StartedCapture(stream: stream, stop: { capture.stop() })
}
