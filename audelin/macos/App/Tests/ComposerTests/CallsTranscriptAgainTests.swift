import CallsListUI
import Foundation
import Recording
import Recordings
import Testing
@testable import Composer

@MainActor
struct CallsTranscriptAgainTests {
    @Test func offersKeepTheirReasonsAndRestorePresence() {
        let state = RecordingsState(calls: [call("A", previous: true), call("B", previous: false)], transcriptOffers: [
            "A": .init(run: .unavailable(.missingTracks([.init(id: "inner", track: .call)]), message: "inner call missing"), restore: .available),
            "B": .init(run: .available, restore: .unavailable(.noPreviousTranscript, message: "no previous")),
        ])
        let rows = mapped(state).rows
        #expect(rows[0].transcriptAgain == .unavailable("inner call missing"))
        #expect(rows[0].restoreTranscript == .available)
        #expect(rows[1].transcriptAgain == .available)
        #expect(rows[1].restoreTranscript == nil)
    }

    @Test func waitsBelongToTheirCallAndOtherRowsStayUsable() {
        for (wait, expected): (TranscriptWait, CallsListState.TranscriptWait) in [
            (.preparing, .init(message: "Готовлю распознавание…")),
            (.hearing(0.4), .init(message: "Распознаю заново", progress: 0.4)),
            (.finishing, .init(message: "Дописываю транскрипт…")),
        ] {
            let state = RecordingsState(calls: [call("A"), call("B")], transcriptRun: .init(id: "B", request: 9, wait: wait))
            let list = mapped(state)
            #expect(list.rows.map(\.transcriptWait) == [nil, expected])
            #expect(list.rows.map(\.editable) == [true, false])
            #expect(!list.busy)
        }
    }

    @Test func failureKindsChooseRetryInfoAndRestoreBannersWithoutParsingMessages() {
        let reason = "same reason"
        for kind: RecordingsState.Failure.Kind in [.action, .transcriptRun, .transcriptStopped, .transcriptRestore] {
            let list = mapped(.init(failure: .init(id: "B", reason: reason, kind: kind)))
            switch kind {
            case .action:
                #expect(list.failure == "«B»: same reason")
                #expect(list.transcriptBanner == nil)
            case .transcriptRun:
                #expect(list.failure == nil)
                #expect(list.transcriptBanner == .init(style: .error, title: "Не удалось распознать заново",
                                                      message: "same reason Прежний транскрипт сохранён.", retryID: "B"))
            case .transcriptStopped:
                #expect(list.failure == nil)
                #expect(list.transcriptBanner == .init(style: .info, title: "Распознавание остановлено",
                                                      message: "same reason Прежний транскрипт сохранён."))
            case .transcriptRestore:
                #expect(list.failure == nil)
                #expect(list.transcriptBanner == .init(style: .error, title: "Не удалось вернуть прежний транскрипт", message: reason))
            }
        }
    }

    @Test func transcriptIntentsReachRecordingsWithTheirCall() async {
        let state = RecordingsState(calls: [call("A"), call("B")])
        var sent: [RecordingsEvent] = []
        let calls = AudelinCalls(inputs: .init(state: { state }, send: { sent.append($0) }),
                                timeZone: .gmt, now: { .distantPast }, recordingState: { .init() },
                                location: { _ in Issue.record("Unexpected location"); return URL(fileURLWithPath: "/unused") },
                                openFolder: { _ in Issue.record("Unexpected open"); return false }, present: {})
        for event: CallsListEvent in [.makeTranscriptAgain("B"), .restorePreviousTranscript("A"), .cancelTranscriptAgain, .retryTranscriptAgain("B")] {
            await calls.send(event)
        }
        #expect(sent == [.recordingChanged(nil), .makeTranscriptAgain("B"), .recordingChanged(nil), .restorePreviousTranscript("A"),
                         .recordingChanged(nil), .cancelTranscriptAgain, .recordingChanged(nil), .makeTranscriptAgain("B")])
    }

    private func mapped(_ state: RecordingsState) -> CallsListState {
        callsListState(state, timeZone: .gmt, now: .distantPast, text: .init(language: .russian))
    }

    private func call(_ id: String, previous: Bool = false) -> RecordedCall {
        .init(id: id, title: id, start: .distantPast, duration: 60, hasPreviousTranscript: previous)
    }
}
