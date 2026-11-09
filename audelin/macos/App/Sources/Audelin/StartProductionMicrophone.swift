import MicrophoneCapture
import Composer

extension MicrophoneCapture: AudioCapture {}
extension AudioPiece: CapturePiece {}

func startProductionMicrophone() async throws -> StartedCapture<CaptureBuffer> {

    try await startProductionMicrophone(makeCapture: { try await MicrophoneCapture(hardware: .system()) })
}

func startProductionMicrophone<Capture: AudioCapture>(
    makeCapture: @Sendable () async throws -> Capture
) async throws -> StartedCapture<CaptureBuffer> {

    startedCapture(try await makeCapture())
}
