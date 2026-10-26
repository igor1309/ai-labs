import struct CallAppProcesses.AudioProcess
import class CallAppProcesses.CallAppProcesses
import protocol CallAppProcesses.ProcessList
import CallFolder
import class CoreAudioProcesses.CoreAudioProcesses
import Foundation
import LiveText
import struct MicrophoneCapture.AudioPiece
import ParakeetRecognizer
import Preferences
import Synchronization
import struct SystemAudioCapture.AudioPiece
import enum SystemAudioCapture.ProcessSelection

/// Remembers the last detected app, including after its call ends.
public final class RecordingCallApp: Sendable {

    private let app = Mutex<String?>(nil)

    public init() {}

    /// Connect to the call subscription's started-app observer.
    public func started(_ app: String) { self.app.withLock { $0 = app } }

    var current: String? { app.withLock { $0 } }
}

/// Takes the stored folder once and the last detected app when each session is built.
public func composeRecordingPieces(
    preferences: PreferencesStore, callApp: RecordingCallApp, processes: CoreAudioProcesses
) -> @Sendable (UInt64) -> SessionPieces {

    composeRecordingPieces(
        preferences: preferences, callApp: callApp, processes: processes,
        now: { Date() }, timeZone: { .current },
        startMicrophone: startProductionMicrophone, startCall: startProductionCallAudio,
        recognizerSource: { try await ParakeetRecognizer() }
    )
}

func composeRecordingPieces(
    preferences: PreferencesStore, callApp: RecordingCallApp, processes: CoreAudioProcesses,
    now: @escaping @Sendable () -> Date, timeZone: @escaping @Sendable () -> TimeZone,
    startMicrophone: @escaping @Sendable () async throws -> StartedCapture<MicrophoneCapture.AudioPiece>,
    startCall: @escaping @Sendable (SystemAudioCapture.ProcessSelection) async throws -> StartedCapture<SystemAudioCapture.AudioPiece>,
    recognizerSource: @escaping @Sendable () async throws -> any Recognizer
) -> @Sendable (UInt64) -> SessionPieces {

    let callsURL = preferences.read().callsFolder
    return { _ in
        let app = callApp.current
        return composeSessionPieces(
            folder: CallFolder(callsURL: callsURL, now: now, timeZone: timeZone()),
            processes: CallAppProcesses(app: app ?? "", list: RecordingProcessList(
                source: processes, appKnown: app != nil
            )),
            startMicrophone: startMicrophone, startCall: startCall,
            microphoneRecognizerSource: recognizerSource, callRecognizerSource: recognizerSource
        )
    }
}

private struct RecordingProcessList: ProcessList {

    enum Failure: Error { case noCallApp }

    let source: CoreAudioProcesses
    let appKnown: Bool

    func processes() throws -> [AudioProcess] {

        // An empty app would match every bundle prefix; fail selection so Session chooses its fallback.
        guard appKnown else { throw Failure.noCallApp }
        return try source.processes().map { process in
            return AudioProcess(
                pid: process.pid, bundleID: process.bundleID, name: process.name, isAudelin: process.isAudelin
            )
        }
    }
}
