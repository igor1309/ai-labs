@testable import Compose
import CoreAudioProcesses
import Foundation
import struct MicrophoneCapture.AudioPiece
import Preferences
import PanelUI
import struct SystemAudioCapture.AudioPiece
import enum SystemAudioCapture.ProcessSelection
import Recording
import Synchronization
import Testing

@Suite(.timeLimit(.minutes(1)))
struct MenuBarTests {

    @Test func applicationConnectsStartupAndStopsDetectionBeforeDraining() async throws {

        for failureAfterStartup in [false, true] {
            try await withComposeFolder { root in
                let preferences = PreferencesStore(fileURL: root.appendingPathComponent("preferences.json"))
                try preferences.write(Preferences(liveText: false, callsFolder: root))
                let binding = CallBinding(fails: false, input: false)
                let clock = QueuedCallClock()
                let processes = CoreAudioProcesses(binding: binding, clock: clock)
                let checks = Values<String>(), events = Values<String>()
                let selections = Values<SystemAudioCapture.ProcessSelection>()
                let microphone = AsyncThrowingStream<MicrophoneCapture.AudioPiece, any Error>.makeStream()
                let call = AsyncThrowingStream<SystemAudioCapture.AudioPiece, any Error>.makeStream()
                let stopping = Signal(), release = Signal()
                let model = Task<Void, any Error> {}
                defer {
                    model.cancel(); stopping.end(); release.end()
                    microphone.continuation.finish(); call.continuation.finish()
                }
                let panelClock = ReadingClockSpy()
                let panel = panelClock.panel()
                let app = try await AudelinRecording(
                    preferences: preferences, access: testAccessPolicy(), processes: processes,
                    now: { Date(timeIntervalSince1970: 0) }, timeZone: { TimeZone(secondsFromGMT: 0)! },
                    startMicrophone: {
                        events.append("microphone started")
                        return StartedCapture(stream: microphone.stream, stop: {
                            #expect(binding.activeListeners == 0)
                            #expect(!clock.active)
                            events.append("stopping")
                            stopping.send()
                            await release.next()
                            microphone.continuation.finish()
                        })
                    },
                    startCall: { selection in
                        selections.append(selection)
                        return StartedCapture(stream: call.stream, stop: { call.continuation.finish() })
                    },
                    recognizerSource: { preconditionFailure("Live text is disabled") }, missingModels: { [] },
                    makeConditions: { recording, folder in
                        #expect(folder == root)
                        return RecordingConditions(
                            recording: recording,
                            microphoneAccess: { checks.append("microphone"); return true },
                            callsFolder: { true }, room: { true }, access: testAccessPolicy()
                        )
                    },
                    startModel: { events.append("model started"); return model }, panel: panel,
                    makeRecording: makeRecording, makeSession: makeSession
                )
                #expect(app.panel === panel)
                var panelStates = await app.panel.states().makeAsyncIterator()
                #expect(await panelStates.next() == .init(recording: .off, log: .empty))
                let initial = await app.inputs.state()
                #expect(initial.phase == .idle && initial.missing.isEmpty && initial.automatic)
                #expect(selections.all.isEmpty)
                #expect(binding.activeListeners == 2)
                #expect(events.all == ["model started"])

                if failureAfterStartup {
                    binding.fail()
                    var failures = [ScriptFailure]()
                    for await error in app.detectionFailures {
                        failures.append(try #require(error as? ScriptFailure))
                    }
                    #expect(failures == [.failed])
                    #expect(binding.activeListeners == 0)
                    #expect(await app.inputs.state().phase == .idle)
                    await runQuit(app.lifecycle { events.append("terminated") })
                    #expect(events.all == ["model started", "terminated"])
                    #expect(model.isCancelled)
                    return
                }

                binding.setInput(true)
                for await state in await app.inputs.states() {
                    if state.phase == .recording {
                        #expect(state.session == .init(id: 1, origin: .call))
                        break
                    }
                }
                var recordingPanel: PanelState?
                while let state = await panelStates.next() {
                    if state.recording == .on(elapsed: "00:00:00") {
                        recordingPanel = state
                        break
                    }
                }
                #expect(recordingPanel == .init(recording: .on(elapsed: "00:00:00"), log: .liveTextOff(kept: nil)))
                panelClock.advance(3)
                while let state = await panelStates.next() {
                    if state.recording == .on(elapsed: "00:00:03") { break }
                }
                #expect(selections.all == [.only([42])])
                // Starts consult the call-audio port; microphone status is read at launch.
                #expect(checks.all == ["microphone", "microphone"])
                binding.setInput(false)
                #expect(clock.active)
                let lateNotifications = binding.queuedNotifications()
                let quit = Task { await runQuit(app.lifecycle { events.append("terminated") }) }
                await stopping.next()
                #expect(events.all == ["model started", "microphone started", "stopping"])
                clock.fireQueued()
                binding.setInput(true)
                lateNotifications.forEach { $0() }
                #expect(await app.inputs.state().phase == .ending)
                release.send()
                await quit.value
                #expect(events.all == ["model started", "microphone started", "stopping", "terminated"])
                #expect(await app.inputs.state().lastSessionID == 1)
                #expect(await app.inputs.state().phase == .idle)
                var terminal = await app.panel.states().makeAsyncIterator()
                #expect(await terminal.next() == .init(recording: .off, log: .empty))
                #expect(model.isCancelled)
            }
        }
    }

}

private final class QueuedCallClock: CallClock {

    private struct State {

        var fire: (@Sendable () -> Void)?
        var active = false
    }
    private let state = Mutex(State())

    var active: Bool { state.withLock { $0.active } }

    func after(_ delay: Duration, _ fire: @escaping @Sendable () -> Void) -> Cancellation {

        #expect(delay == .seconds(30))
        state.withLock { $0.fire = fire; $0.active = true }
        return Cancellation { [weak self] in self?.state.withLock { $0.active = false } }
    }

    func fireQueued() {

        let fire = state.withLock { $0.fire }
        fire?()
    }
}
