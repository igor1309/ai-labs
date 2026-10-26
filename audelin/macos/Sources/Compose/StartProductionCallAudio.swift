import SystemAudioCapture

func startProductionCallAudio(_ selection: ProcessSelection) async throws -> StartedCapture<AudioPiece> {

    let capture = try SystemAudioCapture(binding: CoreAudioBinding(), processes: selection)
    return StartedCapture(stream: capture.audio, stop: { capture.stop() })
}
