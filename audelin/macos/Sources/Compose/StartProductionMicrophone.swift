import MicrophoneCapture

extension MicrophoneCapture: AudioCapture {}

func startProductionMicrophone() async throws -> StartedCapture<AudioPiece> {

    try await startProductionMicrophone(makeCapture: { try MicrophoneCapture() })
}

func startProductionMicrophone<Capture: AudioCapture>(
    makeCapture: @Sendable () throws -> Capture
) async throws -> StartedCapture<Capture.Piece> {

    let capture = try makeCapture()
    return StartedCapture(stream: capture.audio, stop: { capture.stop() })
}
