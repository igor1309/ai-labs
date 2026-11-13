import LiveText
import CallText
import PanelUI
import Reading
import Recording
import Session
import Observation
import Synchronization
import Testing
import Foundation
import protocol TranscriptWriting.CallText
@testable import Composer

struct ReadingCompositionTests {

    @Test func panelActionsReachTheCurrentReading() async throws {
        try await withComposition { rig in
            try await rig.start()
            let shown = try await rig.panel { if case let .lines(lines) = $0.log { !lines.entries.isEmpty } else { false } }
            guard case let .lines(lines) = shown.log else { throw ScriptFailure.failed }
            let entry = try #require(lines.entries.first)
            let held = PanelState.Held(entryID: entry.id, text: "held selection")
            await rig.menu.sendPanel(.hold(held))
            _ = try await rig.panel { if case let .lines(lines) = $0.log { lines.holds == [held] } else { false } }
            await rig.menu.sendPanel(.scrolled(atBottom: false))
            _ = try await rig.panel { if case let .lines(lines) = $0.log { !lines.followsLive } else { false } }
            await rig.menu.sendPanel(.jumpToLive)
            _ = try await rig.panel { if case let .lines(lines) = $0.log { lines.followsLive } else { false } }
            await rig.menu.sendPanel(.letGo(held))
            let released = try await rig.panel { if case let .lines(lines) = $0.log { lines.holds.isEmpty } else { false } }
            if case let .lines(lines) = released.log { #expect(lines.entries.contains { $0.id == entry.id }) }
            try await rig.stop()
        }
    }

    @Test func mapsScrollIdentityThroughTheReducerAndEveryKeptLogMode() throws {

        let interaction = UUID(uuid: (0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 7))
        for atBottom in [false, true] {
            let event = try #require(readingEvent(.scrolled(atBottom: atBottom, interaction: interaction)))
            #expect(event == .scrolled(atBottom: atBottom, interaction: interaction))
            var reading = ReadingReducer.reduce(.init(), .textUpdated(.init(status: .listening, entries: [
                .init(id: .init(speaker: .mine, localID: 1), start: 0, end: 1, settled: "kept"),
            ]))).0
            reading = ReadingReducer.reduce(reading, event).0
            var rows = MappedRows()
            guard case let .lines(lines) = panelState(russianPanel, reading, rows: &rows).log else {
                Issue.record("expected a listening log")
                return
            }
            #expect(lines.scrollAcknowledgement == interaction)
            #expect(lines.followsLive == atBottom)
            reading = ReadingReducer.reduce(reading, .recordingChanged(.on(elapsed: 0))).0
            reading = ReadingReducer.reduce(reading, .textUpdated(.init(status: .off, entries: []))).0
            #expect(panelState(russianPanel, reading, rows: &rows).log == .liveTextOff(kept: lines))
            reading = ReadingReducer.reduce(reading, .jumpToLive).0
            guard case let .liveTextOff(kept) = panelState(russianPanel, reading, rows: &rows).log else {
                Issue.record("expected kept text")
                return
            }
            #expect(kept?.scrollAcknowledgement == interaction)
            #expect(kept?.followsLive == true)
        }
    }

    @Test func aLiveNameIsCaptionedTentativelyOnlyWhereTheSpeakerChanges() async throws {

        var reading = ReadingState()
        func send(_ event: ReadingEvent) { reading = ReadingReducer.reduce(reading, event).0 }
        send(.recordingChanged(.on(elapsed: 30)))
        let snapshot = try await publishedCall(status: .listening, mine: [
            .init(text: .init(id: 1, start: 10, end: 11, words: [.init("мой", start: 10, end: 11)], settledCount: 1)),
        ], theirs: [
            .init(text: .init(id: 1, start: 1, end: 2, words: [.init("раз", start: 1, end: 2)], settledCount: 1)),
            .init(text: .init(id: 2, start: 3, end: 4, words: [.init("два", start: 3, end: 4)], settledCount: 1)),
            .init(text: .init(id: 3, start: 5, end: 6, words: [.init("три", start: 5, end: 6)], settledCount: 1)),
            .init(text: .init(id: 4, start: 12, end: 13, words: [.init("четыре", start: 12, end: 13)], settledCount: 1)),
        ])
        send(.textUpdated(readingText(snapshot, names: [1: "Анна", 2: "Анна", 3: "Борис", 4: "Борис"])))
        guard case let .lines(lines) = panelState(russianPanel, reading).log else { throw ScriptFailure.failed }
        #expect(lines.entries.map(\.label) == ["Анна", nil, "Борис", nil, "Борис"])
        #expect(lines.entries.filter { $0.label != nil }.allSatisfy { $0.labelIsTentative })
    }

    @Test(arguments: [PanelLanguage.russian, .english])
    func diarizedSpeakersAreCaptionedByNameElseByNumberWhereTheSpeakerChanges(language: PanelLanguage) throws {

        var reading = ReadingState()
        reading.log = .lines(.init(rows: .init(tail: [
            .entry(.init(id: 0, time: "00:01", speaker: .theirs, settled: "раз", remoteSpeaker: 1)),
            .entry(.init(id: 1, time: "00:02", speaker: .theirs, settled: "два", remoteSpeaker: 1)),
            .entry(.init(id: 2, time: "00:03", speaker: .mine, settled: "мой")),
            .entry(.init(id: 3, time: "00:04", speaker: .theirs, settled: "три", name: "Анна", nameConfirmed: true, remoteSpeaker: 2)),
            .entry(.init(id: 4, time: "00:05", speaker: .theirs, settled: "четыре", remoteSpeaker: 1)),
            .entry(.init(id: 5, time: "00:06", speaker: .theirs, settled: "пять")),
        ])))
        let text = PanelText(language: language)
        guard case let .lines(lines) = panelState({ text($0) }, reading).log else { throw ScriptFailure.failed }
        let first = language == .russian ? "Собеседник 1" : "Them 1"
        #expect(lines.entries.map(\.label) == [first, nil, nil, "Анна", first, nil])
        #expect(lines.entries.map(\.remoteSpeaker) == [1, 1, nil, 2, 1, nil])
        #expect(lines.entries.allSatisfy { !$0.labelIsTentative })
    }

    @Test func twoSpeakersWithOneNameAreEachCaptionedAcrossTheSealedLines() throws {

        var reading = ReadingState()
        reading.log = .lines(.init(rows: .init(sealed: [
            .entry(.init(id: 0, time: "00:01", speaker: .theirs, settled: "раз", name: "Анна", nameConfirmed: true, remoteSpeaker: 1)),
        ], tail: [
            .entry(.init(id: 1, time: "00:02", speaker: .theirs, settled: "два", name: "Анна", nameConfirmed: true, remoteSpeaker: 2)),
            .entry(.init(id: 2, time: "00:03", speaker: .theirs, settled: "три", name: "Анна", nameConfirmed: true, remoteSpeaker: 2)),
        ])))
        guard case let .lines(lines) = panelState(russianPanel, reading).log else { throw ScriptFailure.failed }
        #expect(lines.entries.map(\.label) == ["Анна", "Анна", nil])
    }

    @Test func aMicrophoneEntryNeverTakesARemoteSpeaker() throws {

        var reading = ReadingState()
        reading.log = .lines(.init(rows: .init(tail: [
            .entry(.init(id: 0, time: "00:01", speaker: .mine, settled: "мой", name: "Анна", remoteSpeaker: 3)),
        ])))
        guard case let .lines(lines) = panelState(russianPanel, reading).log else { throw ScriptFailure.failed }
        #expect(lines.entries.map(\.label) == [nil])
        #expect(lines.entries.map(\.remoteSpeaker) == [nil])
    }

    @Test func translatesPopulatedReadingAndEveryTextStatusAndLogMode() async throws {

        let statuses: [(CallState.Status, ReadingTextUpdate.Status)] = [
            (.off, .off), (.gettingReady, .gettingReady), (.listening, .listening),
            (.failed("reason"), .failed("reason")), (.finished, .finished),
        ]
        for (source, expected) in statuses {
            let snapshot = try await publishedCall(status: source, mine: [
                .init(text: .init(id: 7, start: 1, end: 2, words: [.init("settled", start: 1, end: 2), .init(" pending", start: 1, end: 2)], settledCount: 1)),
            ], theirs: [
                .init(text: .init(id: 7, start: 3, end: 4, words: [.init("late", start: 3, end: 4)], settledCount: 1), writtenLater: true),
            ])
            let translated = readingText(snapshot)
            #expect(translated == .init(status: expected, entries: [
                .init(id: .init(speaker: .mine, localID: 7), start: 1, end: 2, settled: "settled", pending: " pending"),
                .init(id: .init(speaker: .theirs, localID: 7), start: 3, end: 4, settled: "late", writtenLater: true),
            ]))
        }
        #expect(panelState(russianPanel, .init()) == .init(recording: .off, log: .empty))
        var reading = ReadingState()
        func send(_ event: ReadingEvent) { reading = ReadingReducer.reduce(reading, event).0 }
        send(.recordingChanged(.on(elapsed: 62)))
        #expect(panelState(russianPanel, reading) == .init(recording: .on(elapsed: "00:01:02"), log: .liveTextOff(kept: nil)))
        send(.scrolled(atBottom: false))
        let snapshot = try await publishedCall(status: .listening, mine: [
            .init(text: .init(id: 1, start: 1, end: 2, words: [.init("settled", start: 1, end: 2), .init(" pending", start: 1, end: 2)], settledCount: 1)),
        ], theirs: [
            .init(text: .init(id: 1, start: 3, end: 4, words: [.init("late", start: 3, end: 4)], settledCount: 1), writtenLater: true),
        ])
        send(.textUpdated(readingText(snapshot)))
        send(.hold(.init(entryID: 0, text: "held")))
        let holds = [PanelState.Held(entryID: 0, text: "held")]
        let expected = PanelState.Lines(rows: [
            .entry(.init(id: 0, time: "00:01", speaker: .me, settled: "settled", pending: " pending")),
            .late(.init(span: "00:03–00:04", entries: [.init(id: 1, time: "00:03", speaker: .them, settled: "late")])),
        ], holds: holds, newBelow: 2, followsLive: false)
        #expect(panelState(russianPanel, reading) == .init(recording: .on(elapsed: "00:01:02"), log: .lines(expected)))
        send(.textUpdated(.init(status: .off, entries: [])))
        #expect(panelState(russianPanel, reading).log == .liveTextOff(kept: expected))
        send(.textUpdated(.init(status: .gettingReady, entries: [])))
        #expect(panelState(russianPanel, reading).log == .preparing(holds: holds))
        send(.recordingChanged(.off))
        #expect(panelState(russianPanel, reading).recording == .off)
        for event in [PanelEvent.start, .stop, .switchLiveTextOn] { #expect(readingEvent(event) == nil) }
    }

}

func russianPanel(_ phrase: PanelPhrase) -> String {

    PanelText(language: .russian)(phrase)
}

/// The banners the panel shows in Russian, as the composer fills them.
extension PanelState.Banner {

    static let callAudio = Self(kind: .callAudio, title: "Нет звука звонка",
                                line: "Пишется только «я». Проверьте разрешение «Звук звонка».",
                                button: "Открыть настройки macOS", action: .openSettings(.systemAudioRecording))
    static let microphone = Self(kind: .microphone, title: "Нет микрофона",
                                 line: "Пишутся только «они». Проверьте устройство ввода и разрешение «Микрофон».",
                                 button: "Открыть настройки macOS", action: .openSettings(.microphone))
    static let callSilent = Self(kind: .callSilent, title: "Звонок не слышен",
                                 line: "5 минут тишины со стороны «они», пока вы говорите. Проверьте разрешение «Звук звонка».",
                                 button: "Открыть настройки macOS", action: .openSettings(.systemAudioRecording))

    static func diskFull(savedUntil time: String) -> Self {

        Self(kind: .diskFull, title: "Диск заполнен — дорожка остановлена",
             line: "Всё до \(time) сохранено. Освободите место, чтобы продолжить.",
             button: "Открыть папку", action: .openCallsFolder)
    }
}
