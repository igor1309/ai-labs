import struct CallAppProcesses.AudioProcess
import class CallAppProcesses.CallAppProcesses
import protocol CallAppProcesses.ProcessList
import CallFolder
import class CoreAudioProcesses.CoreAudioProcesses
import Foundation
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
            boundary: boundary
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
