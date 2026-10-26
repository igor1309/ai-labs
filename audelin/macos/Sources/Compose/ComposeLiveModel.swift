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
    processes: CallAppProcesses,
    startMicrophone: @escaping @Sendable () async throws -> StartedCapture<MicrophoneCapture.AudioPiece>,
    startCall: @escaping @Sendable (SystemAudioCapture.ProcessSelection) async throws -> StartedCapture<SystemAudioCapture.AudioPiece>,
    microphoneRecognizerSource: @escaping @Sendable () async throws -> any Recognizer = { try await ParakeetRecognizer() },
    callRecognizerSource: @escaping @Sendable () async throws -> any Recognizer = { try await ParakeetRecognizer() }
) -> SessionPieces {

    SessionPieces(
        folder: folder, processes: processes,
        startMicrophone: startMicrophone, startCall: startCall,
        microphoneRecognizerSource: microphoneRecognizerSource, callRecognizerSource: callRecognizerSource
    )
}

/// Call at launch without awaiting. Session preparation reports a load failure when text is needed.
@discardableResult
public func startLiveModelLoading(
    recognizerSource: @escaping @Sendable () async throws -> any Recognizer = { try await ParakeetRecognizer() }
) -> Task<Void, any Error> {

    Task { _ = try await recognizerSource() }
}
