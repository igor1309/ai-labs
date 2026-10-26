import SystemAudioCapture

extension SystemAudioCapture: AudioCapture {}

func startProductionCallAudio(_ selection: ProcessSelection) async throws -> StartedCapture<AudioPiece> {

    try await startProductionCallAudio(selection, makeCapture: {
        try SystemAudioCapture(binding: CoreAudioBinding(), processes: $0)
    })
}

func startProductionCallAudio<Capture: AudioCapture>(
    _ selection: ProcessSelection, makeCapture: @Sendable (ProcessSelection) throws -> Capture
) async throws -> StartedCapture<Capture.Piece> {

    let capture = try makeCapture(selection)
    return StartedCapture(stream: capture.audio, stop: { capture.stop() })
}
