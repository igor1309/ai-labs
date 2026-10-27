@testable import Compose
import CoreAudioProcesses
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

        let binding = CallBinding(fails: false, input: false)
        let clock = QueuedCallClock()
        let processes = CoreAudioProcesses(binding: binding, clock: clock)
        let callApp = RecordingCallApp()
        let ending = Signal(), release = Signal()
        let events = Values<String>(), sessions = Values<UInt64>(), checks = Values<String>()
        let model = Task<Void, any Error> {}
        defer { processes.stop(); model.cancel(); ending.end(); release.end() }
        let session = QuitSession(
            ending: ending, release: release, events: events,
            began: { id in
                #expect(callApp.current == "us.zoom.xos")
                sessions.append(id)
            },
            beforeEnding: {
                #expect(binding.activeListeners == 0)
                #expect(!clock.active)
            }
        )
        let recording = Recording(handler: .init(session: session), initial: .init(automatic: true))
        let conditions = RecordingConditions(
            recording: recording,
            microphoneAccess: { checks.append("microphone"); return true },
            callAudioAccess: { true }, callsFolder: { true }, room: { true }
        )
        let app = try AudelinRecording(
            recording: recording, conditions: conditions, processes: processes, callApp: callApp,
            startModel: { events.append("model started"); return model }
        )
        #expect(app.recording === recording)
        let initial = await app.recording.snapshot()
        #expect(initial.phase == .idle && initial.missing.isEmpty)
        #expect(sessions.all.isEmpty)
        #expect(callApp.current == nil)
        #expect(binding.activeListeners == 2)
        #expect(events.all == ["model started"])

        binding.setInput(true)
        for await state in await recording.states() {
            if state.phase == .recording {
                #expect(state.session == .init(id: 1, origin: .call))
                break
            }
        }
        #expect(checks.all == ["microphone", "microphone"])
        binding.setInput(false)
        #expect(clock.active)
        let lateNotifications = binding.queuedNotifications()
        let quit = Task { await app.quit { events.append("terminated") } }
        await ending.next()
        #expect(events.all == ["model started", "ending"])

        // Core Audio can deliver callbacks queued before listeners were removed.
        clock.fireQueued()
        binding.setInput(true)
        lateNotifications.forEach { $0() }
        #expect(await recording.snapshot().phase == .ending)
        #expect(sessions.all == [1])
        release.send()
        await quit.value
        #expect(events.all == ["model started", "ending", "ended", "terminated"])
        #expect(sessions.all == [1])
        #expect(await recording.snapshot().lastSessionID == 1)
        #expect(await recording.snapshot().phase == .idle)
        #expect(model.isCancelled)
    }

    @Test func quitWaitsForTheRunningRecording() async {

        // Also cover a call queued before quit but not yet reduced.
        for queued in [false, true] {
            let ending = Signal(), release = Signal()
            defer { ending.end(); release.end() }
            let events = Values<String>()
            let session = QuitSession(ending: ending, release: release, events: events, began: { _ in }, beforeEnding: {})
            let recording = Recording(handler: .init(session: session), initial: queued
                ? RecordingState(automatic: true, missing: []) : running())
            if queued { recording.send(.callStarted) }
            let quit = Task { await quitRecording(recording) { events.append("terminated") } }
            await ending.next()
            #expect(events.all == ["ending"])
            release.send()
            await quit.value
            #expect(events.all == ["ending", "ended", "terminated"])
            #expect(await recording.snapshot().phase == .idle)
        }
    }

    @Test func quitWhileIdleTerminatesWithoutASession() async {

        let ending = Signal(), release = Signal()
        defer { ending.end(); release.end() }
        let events = Values<String>()
        let session = QuitSession(ending: ending, release: release, events: events, began: { _ in }, beforeEnding: {})
        let recording = Recording(handler: .init(session: session))
        await quitRecording(recording) { events.append("terminated") }
        #expect(events.all == ["terminated"])
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

private struct QuitSession: RecordingSession {

    let ending: Signal
    let release: Signal
    let events: Values<String>
    let began: @Sendable (UInt64) -> Void
    let beforeEnding: @Sendable () -> Void

    func begin(id: UInt64) async -> RecordingSessionReport {

        began(id)
        return .ready
    }

    func end(id: UInt64) async {

        beforeEnding()
        events.append("ending")
        ending.send()
        await release.next()
        events.append("ended")
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
