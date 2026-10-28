import AVFoundation
import CoreAudioProcesses
import Foundation
import Lifecycle
import LiveText
import struct MicrophoneCapture.AudioPiece
import ParakeetRecognizer
import Preferences
import Recording
import struct SystemAudioCapture.AudioPiece
import enum SystemAudioCapture.ProcessSelection

/// Retains the application's connected recording, detector and model load.
public final class AudelinRecording: Sendable {

    public let recording: Recording
    public let panel: AudelinPanel
    public let detectionFailures: AsyncStream<any Error>
    private let conditions: RecordingConditions
    private let delivery: ApplicationDelivery

    public convenience init(preferences: PreferencesStore) async throws {

        createDefaultCallsFolder(preferences.read().callsFolder, default: Preferences().callsFolder)
        try await self.init(
            preferences: preferences,
            processes: CoreAudioProcesses(binding: CoreAudioBinding(), clock: ContinuousCallClock()),
            now: { Date() }, timeZone: { .current },
            startMicrophone: startProductionMicrophone, startCall: startProductionCallAudio,
            recognizerSource: { try await ParakeetRecognizer() }, missingModels: productionMissingModels,
            makeConditions: composeRecordingConditions,
            startModel: { startLiveModelLoading() }, panel: AudelinPanel()
        )
        // Reading the status never asks; without this request macOS never prompts.
        AVCaptureDevice.requestAccess(for: .audio) { [conditions] _ in conditions.refresh() }
    }

    init(
        preferences: PreferencesStore, processes: CoreAudioProcesses,
        now: @escaping @Sendable () -> Date, timeZone: @escaping @Sendable () -> TimeZone,
        startMicrophone: @escaping @Sendable () async throws -> StartedCapture<MicrophoneCapture.AudioPiece>,
        startCall: @escaping @Sendable (SystemAudioCapture.ProcessSelection) async throws -> StartedCapture<SystemAudioCapture.AudioPiece>,
        recognizerSource: @escaping @Sendable () async throws -> any Recognizer,
        missingModels: @escaping @Sendable () -> [String],
        makeConditions: (Recording, URL) -> RecordingConditions,
        startModel: () -> Task<Void, any Error>,
        panel: AudelinPanel
    ) async throws {

        let app = RecordingCallApp()
        self.panel = panel
        let (recording, conditions) = await composeRecordingWithPreferences(
            preferences: preferences,
            makePieces: composeRecordingPieces(
                preferences: preferences, callApp: app, processes: processes,
                now: now, timeZone: timeZone, startMicrophone: startMicrophone,
                startCall: startCall, recognizerSource: recognizerSource, missingModels: missingModels
            ),
            makeConditions: makeConditions, panel: panel
        )
        self.recording = recording
        self.conditions = conditions
        conditions.refresh()
        let calls: CallRecordingSubscription
        do {
            calls = try composeCalls(processes, to: recording, conditions: conditions, startedApp: { app.started($0) })
        } catch {
            processes.stop()
            Task { await recording.end() }
            throw error
        }
        detectionFailures = calls.failures
        delivery = ApplicationDelivery(processes: processes, calls: calls, model: startModel())
    }

    public func quit(terminate: @escaping @Sendable () async -> Void) async {

        await Lifecycle(delivery: delivery, recording: ApplicationRecording(recording: recording), terminate: terminate).quit()
    }
}

private struct ApplicationDelivery: LifecycleDelivery {

    let processes: CoreAudioProcesses
    let calls: CallRecordingSubscription
    let model: Task<Void, any Error>

    func stop() async {

        calls.cancel()
        processes.stop()
        await calls.wait()
        model.cancel()
    }
}

struct ApplicationRecording: LifecycleRecording {

    let recording: Recording

    func requestStop() { recording.send(.userStop) }
    func drain() async { _ = await recording.snapshot() }
    func end() async { await recording.end() }

    func states() async -> AsyncStream<LifecycleRecordingState> {

        let states = await recording.states()
        return AsyncStream { output in
            let task = Task {
                for await state in states {
                    output.yield(state.phase == .idle ? .idle : .busy)
                }
                output.finish()
            }
            output.onTermination = { _ in task.cancel() }
        }
    }
}

/// Creates the calls folder only when it is the default one: a folder the user
/// chose and later lost stays unavailable rather than being made anew.
func createDefaultCallsFolder(_ folder: URL, default defaultFolder: URL) {

    guard folder.standardizedFileURL == defaultFolder.standardizedFileURL else { return }
    try? FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
}
