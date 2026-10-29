import AVFoundation
import CoreAudioProcesses
import Foundation
import Lifecycle
import LiveText
import struct MicrophoneCapture.AudioPiece
import ParakeetRecognizer
import Preferences
import Recording
import Synchronization
import struct SystemAudioCapture.AudioPiece
import enum SystemAudioCapture.ProcessSelection

/// Retains the application's connected recording, detector and model load.
public final class AudelinRecording: Sendable {

    public let inputs: RecordingInputs
    public let panel: AudelinPanel
    public let detectionFailures: AsyncStream<any Error>
    private let conditions: RecordingConditions
    private let delivery: ApplicationDelivery

    public convenience init(
        preferences: PreferencesStore,
        makeReading: @escaping @MainActor @Sendable () -> ReadingInputs,
        makeRecording: @escaping MakeRecordingModel,
        makeSession: @escaping MakeSessionModel
    ) async throws {

        await createDefaultCallsFolder(preferences.read().callsFolder, default: Preferences().callsFolder)
        try await self.init(
            preferences: preferences,
            processes: CoreAudioProcesses(binding: CoreAudioBinding(), clock: ContinuousCallClock()),
            now: { Date() }, timeZone: { .current },
            startMicrophone: startProductionMicrophone, startCall: startProductionCallAudio,
            recognizerSource: { try await ParakeetRecognizer() }, missingModels: productionMissingModels,
            makeConditions: composeRecordingConditions,
            startModel: { startLiveModelLoading() }, panel: AudelinPanel(makeReading: makeReading),
            makeRecording: makeRecording, makeSession: makeSession
        )
        // Reading the status never asks; without this request macOS never prompts.
        AVCaptureDevice.requestAccess(for: .audio) { [conditions] _ in Task { await conditions.refresh() } }
    }

    init(
        preferences: PreferencesStore, processes: CoreAudioProcesses,
        now: @escaping @Sendable () -> Date, timeZone: @escaping @Sendable () -> TimeZone,
        startMicrophone: @escaping @Sendable () async throws -> StartedCapture<MicrophoneCapture.AudioPiece>,
        startCall: @escaping @Sendable (SystemAudioCapture.ProcessSelection) async throws -> StartedCapture<SystemAudioCapture.AudioPiece>,
        recognizerSource: @escaping @Sendable () async throws -> any Recognizer,
        missingModels: @escaping @Sendable () -> [String],
        makeConditions: (RecordingInputs, URL) -> RecordingConditions,
        startModel: () -> Task<Void, any Error>,
        panel: AudelinPanel,
        makeRecording: MakeRecordingModel,
        makeSession: @escaping MakeSessionModel
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
            makeConditions: makeConditions, panel: panel, makeModel: makeRecording,
            makeSession: makeSession
        )
        let inputs = recording
        self.inputs = inputs
        self.conditions = conditions
        await conditions.refresh()
        let calls: CallRecordingSubscription
        do {
            calls = try await composeCalls(processes, to: inputs, conditions: conditions, startedApp: { app.started($0) })
        } catch {
            await processes.stop()
            Task { await inputs.end() }
            throw error
        }
        detectionFailures = calls.failures
        delivery = ApplicationDelivery(processes: processes, calls: calls, model: startModel())
    }

    public func lifecycle(terminate: @escaping @Sendable () async -> Void) -> LifecycleEffectHandler {

        LifecycleEffectHandler(delivery: delivery, recording: ApplicationRecording(recording: inputs), terminate: terminate)
    }
}

private struct ApplicationDelivery: LifecycleDelivery {

    let processes: CoreAudioProcesses
    let calls: CallRecordingSubscription
    let model: Task<Void, any Error>

    func stop() async {

        await calls.cancel()
        await processes.stop()
        model.cancel()
    }
}

final class ApplicationRecording: LifecycleRecording {

    let recording: RecordingInputs
    private let stopping = Mutex<Task<Void, Never>?>(nil)

    init(recording: RecordingInputs) {

        self.recording = recording
    }

    // Lifecycle asks for a stop without waiting, so the drain that follows joins the send.
    func requestStop() {

        stopping.withLock { [recording] previous in
            let earlier = previous
            previous = Task {
                await earlier?.value
                await recording.send(.userStop)
            }
        }
    }

    func drain() async {

        await stopping.withLock { $0 }?.value
        _ = await recording.state()
    }
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
func createDefaultCallsFolder(_ folder: URL, default defaultFolder: URL) async {

    guard folder.standardizedFileURL == defaultFolder.standardizedFileURL else { return }
    // Creating a folder blocks on the disk, so it runs outside the cooperative pool.
    await withCheckedContinuation { (done: CheckedContinuation<Void, Never>) in
        DispatchQueue(label: "audelin.CallsFolderCreation").async {
            try? FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
            done.resume()
        }
    }
}
