@testable import Compose
import CoreAudioProcesses
import Foundation
import struct MicrophoneCapture.AudioPiece
import Preferences
import struct SystemAudioCapture.AudioPiece
import enum SystemAudioCapture.ProcessSelection
import Recording
import Synchronization
import Testing

@Suite(.timeLimit(.minutes(1)))
struct MenuBarTests {

    @Test func idleShowsWaitingOrMissingConditions() {

        for (automatic, missing, message): (Bool, Set<RecordingCondition>, String) in [
            (true, [], "Ждёт звонка"),
            (false, [], "Не записывает"),
            (true, [.microphoneAccess], "Нет доступа к микрофону"),
            (true, [.callAudioAccess], "Нет доступа к звуку звонка"),
            (true, [.callsFolder], "Папка звонков недоступна"),
            (true, [.room], "Недостаточно места для записи"),
        ] {
            let item = MenuBarItem.from(RecordingState(automatic: automatic, missing: missing), liveText: true)
            #expect(item.title == "Audelin")
            #expect(item.symbol == "text.alignleft")
            #expect(item.stateLine == message)
        }
    }

    @Test func recordingStartedByTheCall() {

        let item = MenuBarItem.from(running(), liveText: true)
        #expect(item.title == "Запись")
        #expect(item.symbol == "record.circle.fill")
        #expect(item.stateLine == "Запись · звонок")
    }

    @Test func recordingWithoutLiveText() {

        let item = MenuBarItem.from(running(), liveText: false)
        #expect(item.title == "Запись")
        #expect(item.symbol == "record.circle.fill")
        #expect(item.stateLine == "Запись без текста")
    }

    @Test func applicationConnectsStartupAndStopsDetectionBeforeDraining() async throws {

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
                processes.stop(); model.cancel(); stopping.end(); release.end()
                microphone.continuation.finish(); call.continuation.finish()
            }
            let app = try AudelinRecording(
                preferences: preferences, processes: processes,
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
                recognizerSource: { preconditionFailure("Live text is disabled") },
                makeConditions: { recording, folder in
                    #expect(folder == root)
                    return RecordingConditions(
                        recording: recording,
                        microphoneAccess: { checks.append("microphone"); return true },
                        callAudioAccess: { true }, callsFolder: { true }, room: { true }
                    )
                },
                startModel: { events.append("model started"); return model }
            )
            let initial = await app.recording.snapshot()
            #expect(initial.phase == .idle && initial.missing.isEmpty && initial.automatic)
            #expect(selections.all.isEmpty)
            #expect(binding.activeListeners == 2)
            #expect(events.all == ["model started"])

            binding.setInput(true)
            for await state in await app.recording.states() {
                if state.phase == .recording {
                    #expect(state.session == .init(id: 1, origin: .call))
                    break
                }
            }
            #expect(selections.all == [.only([42])])
            #expect(checks.all == ["microphone", "microphone"])
            binding.setInput(false)
            #expect(clock.active)
            let lateNotifications = binding.queuedNotifications()
            let quit = Task { await app.quit { events.append("terminated") } }
            await stopping.next()
            #expect(events.all == ["model started", "microphone started", "stopping"])
            clock.fireQueued()
            binding.setInput(true)
            lateNotifications.forEach { $0() }
            #expect(await app.recording.snapshot().phase == .ending)
            release.send()
            await quit.value
            #expect(events.all == ["model started", "microphone started", "stopping", "terminated"])
            #expect(await app.recording.snapshot().lastSessionID == 1)
            #expect(await app.recording.snapshot().phase == .idle)
            #expect(model.isCancelled)
        }
    }

    private func running() -> RecordingState {

        var state = RecordingState(automatic: true, missing: [])
        state.phase = .recording
        state.callOn = true
        state.lastSessionID = 1
        state.session = .init(id: 1, origin: .call)
        return state
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
