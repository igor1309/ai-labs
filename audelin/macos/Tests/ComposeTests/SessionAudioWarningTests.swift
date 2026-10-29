import MenuBar
import PanelUI
import Recording
import Session
import Testing
@testable import Compose

@Suite(.timeLimit(.minutes(1)))
struct SessionAudioWarningTests {

    @Test func sessionObservationFeedsFaultsAndWarningToTheLivePanel() async throws {

        try await withSessionRig(connect: { _, _ in Task {} }) { rig, _ in
            let session = WarningSession(statesOnBegin: [SessionState(
                health: [.access(.microphone): .accessLost], phase: .recording, audioWarning: .callSilent
            )])
            let panel = ReadingClockSpy().panel()
            let sessions = RecordingSessions(makePieces: { _ in rig.pieces }, liveText: { false },
                report: { _, _ in }, connect: { _, _ in Task {} }, sink: SystemLogSink(), panel: panel,
                makeSession: { _ in await session.inputs() })
            #expect(await sessions.begin(id: 1) == .ready)
            var states = await panel.states().makeAsyncIterator()
            while let shown = await states.next() {
                guard shown.banners.count == 2 else { continue }
                #expect(shown.banners == [.callSilent, .microphone])
                #expect(shown.log == .liveTextOff(kept: .init(rows: [
                    .gap(.init(speaker: .me, text: "— нет микрофона с 00:00 —")),
                ])))
                break
            }
            await sessions.end(id: 1)
            var ended = await panel.states().makeAsyncIterator()
            #expect(await ended.next() == .init(recording: .off, log: .empty))
        }
    }

    @Test func sessionAudioWarningIsVisibleWhileRecording() async throws {

        try await withSessionRig(connect: { _, _ in Task {} }) { rig, _ in
            let session = WarningSession(statesOnBegin: [SessionState(phase: .recording, audioWarning: .callSilent)])
            let recording = await composeRecording(initial: .init(missing: []), access: testAccessPolicy(),
                makePieces: { _ in rig.pieces }, liveText: { false }, panel: ReadingClockSpy().panel(),
                makeModel: makeRecording, makeSession: { _ in await session.inputs() })
            await recording.send(.userStart)
            do {
                let warned = try await warningState(recording) { $0.phase == .recording && $0.callSilent }
                let menu = MenuBarModel(recording: menuBarRecording(warned), preferences: .init(automatic: false, liveText: false))
                #expect(menu.entries.first == .stateLine("Запись без текста; Звук звонка не слышен — проверьте доступ к записи звука"))
                #expect(warned.faults.isEmpty)

                await session.publish(SessionState(phase: .recording))
                let cleared = try await warningState(recording) { !$0.callSilent }
                let clearedMenu = MenuBarModel(recording: menuBarRecording(cleared), preferences: .init(automatic: false, liveText: false))
                #expect(clearedMenu.entries.first == .stateLine("Запись без текста"))
                #expect(cleared.phase == .recording && cleared.faults.isEmpty)
                await recording.send(.userStop)
                _ = try await warningState(recording) { $0.phase == .idle }
            } catch {
                await recording.send(.userStop)
                _ = try? await warningState(recording) { $0.phase == .idle }
                await recording.end()
                throw error
            }
            await recording.end()
        }
    }

    @Test func audioWarningIsDeliveredOnlyOnChangeAfterReady() async throws {

        try await withSessionRig(connect: { _, _ in Task {} }) { rig, _ in
            let session = WarningSession(statesOnBegin: [
                SessionState(phase: .bringingUp, audioWarning: .callSilent),
                SessionState(phase: .recording, audioWarning: .callSilent),
                SessionState(phase: .recording, liveText: .gettingReady, audioWarning: .callSilent),
                SessionState(phase: .recording, liveText: .gettingReady),
                SessionState(phase: .recording),
            ])
            let reports = Values<RecordingSessionReport>()
            let sessions = RecordingSessions(makePieces: { _ in rig.pieces }, liveText: { false },
                report: { id, report in #expect(id == 7); reports.append(report) },
                connect: { _, _ in Task {} }, sink: SystemLogSink(), panel: ReadingClockSpy().panel(),
                makeSession: { _ in await session.inputs() })
            #expect(await sessions.begin(id: 7) == .ready)
            await sessions.end(id: 7)
            #expect(reports.all == [.callSilent(true), .callSilent(false)])
        }
    }

    @Test(arguments: [false, true])
    func warningThatClearsBeforeReadyIsNotDelivered(cannotRecord: Bool) async throws {

        try await withSessionRig(connect: { _, _ in Task {} }) { rig, _ in
            let session = WarningSession(statesOnBegin: [
                SessionState(phase: .bringingUp, audioWarning: .callSilent),
                cannotRecord ? SessionState(phase: .ending, cannotRecord: "no audio", audioWarning: .callSilent)
                    : SessionState(phase: .recording),
            ])
            let reports = Values<RecordingSessionReport>()
            let sessions = RecordingSessions(makePieces: { _ in rig.pieces }, liveText: { false },
                report: { _, report in reports.append(report) }, connect: { _, _ in Task {} },
                sink: SystemLogSink(), panel: ReadingClockSpy().panel(), makeSession: { _ in await session.inputs() })
            #expect(await sessions.begin(id: 1) == (cannotRecord ? .cannotRecord("no audio") : .ready))
            await sessions.end(id: 1)
            #expect(reports.all.isEmpty)
        }
    }
}

private actor WarningSession {

    private let statesOnBegin: [SessionState]
    private var state = SessionState()
    private let feed = StateFeed<SessionState>()

    init(statesOnBegin: [SessionState]) { self.statesOnBegin = statesOnBegin }

    func inputs() -> SessionInputs {

        SessionInputs(send: { await self.send($0) }, states: { await self.states() }, end: { self.feed.finish() })
    }

    func publish(_ state: SessionState) {

        self.state = state
        feed.publish(state)
    }

    private func states() -> AsyncStream<SessionState> { feed.subscribe(from: state) }

    private func send(_ event: SessionEvent) {

        switch event {
        case .begin:
            for state in statesOnBegin { publish(state) }
        case .end:
            publish(SessionState(phase: .ended))
        default: break
        }
    }
}

private func warningState(_ recording: RecordingInputs, matches: (RecordingState) -> Bool) async throws -> RecordingState {

    for await state in await recording.states() { if matches(state) { return state } }
    throw ScriptFailure.failed
}
