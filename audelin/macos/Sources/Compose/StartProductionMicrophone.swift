import MicrophoneCapture

extension MicrophoneCapture: AudioCapture {}

func startProductionMicrophone() async throws -> StartedCapture<AudioPiece> {

    try await startProductionMicrophone(makeCapture: { try await MicrophoneCapture() })
}

func startProductionMicrophone<Capture: AudioCapture>(
    makeCapture: @Sendable () async throws -> Capture
) async throws -> StartedCapture<Capture.Piece> {

    let capture = try await makeCapture()
    return StartedCapture(stream: capture.audio, stop: { capture.stop() })
}
