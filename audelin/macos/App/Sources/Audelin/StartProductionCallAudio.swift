import SystemAudioCapture
import Composer

extension SystemAudioCapture: AudioCapture {}
extension AudioPiece: CapturePiece {}

func startProductionCallAudio(_ selection: CaptureSelection) async throws -> StartedCapture<CaptureBuffer> {

    try await startProductionCallAudio(selection) { selection in
        let processes: ProcessSelection = switch selection {
        case let .only(pids): .only(pids)
        case let .allExcept(pids): .allExcept(pids)
        }
        return try await SystemAudioCapture(binding: CoreAudioBinding(native: .system), processes: processes)
    }
}

func startProductionCallAudio<Capture: AudioCapture>(
    _ selection: CaptureSelection, makeCapture: @Sendable (CaptureSelection) async throws -> Capture
) async throws -> StartedCapture<CaptureBuffer> {

    startedCapture(try await makeCapture(selection))
}
