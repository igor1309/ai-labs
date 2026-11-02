import MicrophoneCapture
import Composer

extension MicrophoneCapture: AudioCapture {}

func startProductionMicrophone() async throws -> StartedCapture<CaptureBuffer> {

    let capture = try await MicrophoneCapture()
    return StartedCapture(stream: mapCapture(capture.audio), stop: { capture.stop() })
}

func startProductionMicrophone<Capture: AudioCapture>(
    makeCapture: @Sendable () async throws -> Capture
) async throws -> StartedCapture<Capture.Piece> {

    let capture = try await makeCapture()
    return StartedCapture(stream: capture.audio, stop: { capture.stop() })
}

private func mapped<Piece: Sendable>(_ source: AsyncThrowingStream<Piece, any Error>,
                                    unpack: @escaping @Sendable (Piece) -> CaptureBuffer) -> AsyncThrowingStream<CaptureBuffer, any Error> {
    AsyncThrowingStream { output in
        let task = Task {
            do {
                for try await piece in source { output.yield(unpack(piece)) }
                output.finish()
            } catch { output.finish(throwing: error) }
        }
        output.onTermination = { _ in task.cancel() }
    }
}

private func mapCapture(_ source: AsyncThrowingStream<AudioPiece, any Error>) -> AsyncThrowingStream<CaptureBuffer, any Error> {
    mapped(source) { CaptureBuffer(samples: $0.samples, sampleRate: $0.sampleRate) }
}
