import CallAppProcesses
import CallFolder
import LiveText
import struct MicrophoneCapture.AudioPiece
import ParakeetRecognizer
import struct SystemAudioCapture.AudioPiece
import enum SystemAudioCapture.ProcessSelection

/// Builds a session immediately; each side gets its own recognizer over the shared model.
public func composeSessionPieces(
    folder: CallFolder,
    folderTitle: String? = nil,
    processes: CallAppProcesses,
    startMicrophone: @escaping @Sendable () async throws -> StartedCapture<MicrophoneCapture.AudioPiece>,
    startCall: @escaping @Sendable (SystemAudioCapture.ProcessSelection) async throws -> StartedCapture<SystemAudioCapture.AudioPiece>,
    microphoneRecognizerSource: @escaping @Sendable () async throws -> any Recognizer = { try await ParakeetRecognizer() },
    callRecognizerSource: @escaping @Sendable () async throws -> any Recognizer = { try await ParakeetRecognizer() },
    missingModels: @escaping @Sendable () -> [String]
) -> SessionPieces {

    SessionPieces(
        folder: folder, folderTitle: folderTitle, processes: processes,
        startMicrophone: startMicrophone, startCall: startCall,
        microphoneRecognizerSource: microphoneRecognizerSource, callRecognizerSource: callRecognizerSource,
        missingModels: missingModels
    )
}

/// Call at launch without awaiting. Session preparation reports a load failure when text is needed.
@discardableResult
public func startLiveModelLoading(
    recognizerSource: @escaping @Sendable () async throws -> any Recognizer = { try await ParakeetRecognizer() }
) -> Task<Void, any Error> {

    loadModel(recognizerSource: recognizerSource, sink: SystemLogSink())
}

func loadModel(
    recognizerSource: @escaping @Sendable () async throws -> any Recognizer,
    sink: any LogSink
) -> Task<Void, any Error> {

    Task {
        sink.write(.init(category: .model, message: "load started"))
        do {
            _ = try await recognizerSource()
            sink.write(.init(category: .model, message: "load finished"))
        } catch {
            sink.write(.init(category: .model, message: "load failed", error: String(describing: error)))
            throw error
        }
    }
}
