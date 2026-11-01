import struct CallAppProcesses.AudioProcess
import class CallAppProcesses.CallAppProcesses
import protocol CallAppProcesses.ProcessList
import CallFolder
import class CoreAudioProcesses.CoreAudioProcesses
import Foundation
import LiveText
import protocol RecordedCapture.Track
import Preferences
import Synchronization

/// Remembers the last detected app, including after its call ends.
final class RecordingCallApp: Sendable {

    private let app = Mutex<String?>(nil)

    init() {}

    /// Connect to the call subscription's started-app observer.
    func started(_ app: String) { self.app.withLock { $0 = app } }

    var current: String? { app.withLock { $0 } }
}

/// Takes the stored folder once and the last detected app when each session is built.
func composeRecordingPieces(
    preferences: PreferencesStore, callApp: RecordingCallApp, processes: CoreAudioProcesses,
    boundary: ComposerBoundary
) -> @Sendable (UInt64) -> SessionPieces {

    let callsURL = preferences.read().callsFolder
    return { _ in
        let app = callApp.current
        return SessionPieces(
            folder: CallFolder(callsURL: callsURL, now: boundary.time.now, timeZone: boundary.time.timeZone()),
            folderTitle: app.flatMap(CoreAudioProcesses.callAppName),
            processes: CallAppProcesses(app: app ?? "", list: RecordingProcessList(
                source: processes, appKnown: app != nil
            )),
            startMicrophone: { try await boundary.microphone.start() }, startCall: { try await boundary.callAudio.start($0) },
            microphoneRecognizerSource: { BoundaryRecognizer(base: try await boundary.recognizers.recognizer(for: .microphone)) },
            callRecognizerSource: { BoundaryRecognizer(base: try await boundary.recognizers.recognizer(for: .call)) },
            missingModels: { boundary.recognizers.missingModels() }, monotonicNow: boundary.time.monotonicNow,
            recordingTrack: { _, file in
                switch boundary.capturePersistence {
                case .recorded: CaptureTrack(track: file)
                case .transient: TransientTrack()
                }
            },
            captureLogSink: boundary.log, intervals: boundary.intervals, sleep: boundary.time.sleep
        )
    }
}

private struct RecordingProcessList: ProcessList {

    enum Failure: Error { case noCallApp }

    let source: CoreAudioProcesses
    let appKnown: Bool

    func processes() async throws -> [AudioProcess] {

        // An empty app would match every bundle prefix; fail selection so Session chooses its fallback.
        guard appKnown else { throw Failure.noCallApp }
        return try await source.processes().map { process in
            return AudioProcess(
                pid: process.pid, bundleID: process.bundleID, name: process.name, isAudelin: process.isAudelin
            )
        }
    }
}

private struct TransientTrack: Track {
    func write(_ samples: [Float], sampleRate: Double) async throws {}
}
