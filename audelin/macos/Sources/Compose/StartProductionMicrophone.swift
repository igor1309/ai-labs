import MicrophoneCapture

func startProductionMicrophone() async throws -> StartedCapture<AudioPiece> {

    let capture = try MicrophoneCapture()
    return StartedCapture(stream: capture.audio, stop: { capture.stop() })
}
