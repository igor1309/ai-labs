import CallAudioAccess
import CoreAudioProcesses
import Foundation
import LiveText
import Preferences
import Recording

/// Retains the application's connected recording, detector and model load.
final class AudelinRecording: Sendable {

    let inputs: RecordingInputs
    let panel: AudelinPanel
    let detectionFailures: AsyncStream<any Error>
    private let conditions: RecordingConditions
    private let delivery: ApplicationDelivery

    init(
        preferences: PreferencesStore, occupiedCallNames: @escaping @Sendable () throws -> [String],
        boundary: ComposerBoundary, processes: CoreAudioProcesses,
        panel: AudelinPanel, finalization: TranscriptFinalizationModel, finalizationResources: FinalizationResources, summaries: SummaryCallbacks = .disabled
    ) async throws {

        let app = RecordingCallApp()
        self.panel = panel
        let (recording, conditions) = await composeRecordingWithPreferences(
            preferences: preferences, occupiedCallNames: occupiedCallNames, callApp: app, processes: processes, boundary: boundary, panel: panel, finalization: finalization, finalizationResources: finalizationResources, summaries: summaries
        )
        let inputs = recording
        self.inputs = inputs
        self.conditions = conditions
        await conditions.refresh()
        let calls: CallRecordingSubscription
        do {
            calls = try await composeCalls(processes, to: inputs, conditions: conditions, startedApp: { app.started($0) }, sink: boundary.log)
        } catch {
            await processes.stop()
            Task { await inputs.end() }
            throw error
        }
        detectionFailures = calls.failures
        delivery = ApplicationDelivery(processes: processes, calls: calls, model: boundary.recognizers.startLoading())
        Task {
            await boundary.microphonePermission.request()
            await conditions.refresh()
        }
    }

    func reserveStorage() async -> Bool {
        guard await inputs.reserveStorage() else { return false }
        await conditions.setStorageMoving(true)
        return true
    }
    func releaseStorage() async {
        await conditions.setStorageMoving(false)
        await conditions.refresh()
        await inputs.releaseStorage()
    }

    /// Stops call detection, the processes it watches and the model load, so no new
    /// recording is reported while the app quits.
    func stopDelivery() async { await delivery.stop() }
}

private struct ApplicationDelivery: Sendable {

    let processes: CoreAudioProcesses
    let calls: CallRecordingSubscription
    let model: Task<Void, any Error>

    func stop() async {

        await calls.cancel()
        await processes.stop()
        model.cancel()
    }
}

/// Creates the calls folder only when it is the default one: a folder the user
/// chose and later lost stays unavailable rather than being made anew.
func createDefaultCallsFolder(_ folder: URL, default defaultFolder: URL) async {

    guard folder.standardizedFileURL == defaultFolder.standardizedFileURL else { return }
    try? FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
}
