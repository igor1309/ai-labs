import Compose
import Recording
import Testing

@Suite(.timeLimit(.minutes(1)))
struct MenuBarTests {

    @Test func waitingForACall() {

        let state = RecordingState(automatic: true, missing: [])
        let item = MenuBarItem.from(state, liveText: true)
        #expect(item.title == "Audelin")
        #expect(item.symbol == "text.alignleft")
        #expect(item.stateLine == "Ждёт звонка")
        var manual = state
        manual.automatic = false
        #expect(MenuBarItem.from(manual, liveText: true).stateLine == "Не записывает")
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

    @Test func idleShowsMissingConditions() {

        for (condition, message): (RecordingCondition, String) in [
            (.microphoneAccess, "Нет доступа к микрофону"),
            (.callAudioAccess, "Нет доступа к звуку звонка"),
            (.callsFolder, "Папка звонков недоступна"),
            (.room, "Недостаточно места для записи"),
        ] {
            let state = RecordingState(automatic: true, missing: [condition])
            let item = MenuBarItem.from(state, liveText: true)
            #expect(item.title == "Audelin")
            #expect(item.symbol == "text.alignleft")
            #expect(item.stateLine == message)
        }
    }

    @Test func quitWaitsForTheRunningRecording() async {

        // Also cover a call queued before quit but not yet reduced.
        for queued in [false, true] {
            let ending = Signal(), release = Signal()
            defer { ending.end(); release.end() }
            let events = Values<String>()
            let session = QuitSession(ending: ending, release: release, events: events)
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
        let session = QuitSession(ending: ending, release: release, events: events)
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

    func begin(id: UInt64) async -> RecordingSessionReport { .ready }

    func end(id: UInt64) async {

        events.append("ending")
        ending.send()
        await release.next()
        events.append("ended")
    }
}
