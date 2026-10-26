import CoreAudioProcesses
import Preferences
import Recording

/// Retains the launch composition and stops detection before draining a recording.
public final class AudelinRecording: Sendable {

    public let recording: Recording
    private let conditions: RecordingConditions
    private let processes: CoreAudioProcesses
    private let calls: CallRecordingSubscription
    private let model: Task<Void, any Error>

    public init(preferences: PreferencesStore) throws {

        let processes = CoreAudioProcesses(binding: CoreAudioBinding(), clock: ContinuousCallClock())
        let app = RecordingCallApp()
        let (recording, conditions) = composeRecordingWithPreferences(
            preferences: preferences,
            makePieces: composeRecordingPieces(preferences: preferences, callApp: app, processes: processes)
        )
        conditions.refresh()
        do {
            calls = try composeCalls(processes, to: recording, conditions: conditions, startedApp: { app.started($0) })
        } catch {
            processes.stop()
            Task { await recording.end() }
            throw error
        }
        self.processes = processes
        self.recording = recording
        self.conditions = conditions
        model = startLiveModelLoading()
    }

    public func quit(terminate: @Sendable () async -> Void) async {

        calls.cancel()
        processes.stop()
        await calls.wait()
        model.cancel()
        await quitRecording(recording, terminate: terminate)
    }
}
