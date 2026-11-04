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

    @Test @MainActor func panelActionsReachTheCurrentReading() async throws {
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
            guard case let .lines(lines) = panelState(reading, rows: &rows).log else {
                Issue.record("expected a listening log")
                return
            }
            #expect(lines.scrollAcknowledgement == interaction)
            #expect(lines.followsLive == atBottom)
            reading = ReadingReducer.reduce(reading, .recordingChanged(.on(elapsed: 0))).0
            reading = ReadingReducer.reduce(reading, .textUpdated(.init(status: .off, entries: []))).0
            #expect(panelState(reading, rows: &rows).log == .liveTextOff(kept: lines))
            reading = ReadingReducer.reduce(reading, .jumpToLive).0
            guard case let .liveTextOff(kept) = panelState(reading, rows: &rows).log else {
                Issue.record("expected kept text")
                return
            }
            #expect(kept?.scrollAcknowledgement == interaction)
            #expect(kept?.followsLive == true)
        }
    }

    @Test func translatesPopulatedReadingAndEveryTextStatusAndLogMode() async throws {

        let statuses: [(State.Status, ReadingTextUpdate.Status)] = [
            (.off, .off), (.gettingReady, .gettingReady), (.listening, .listening),
            (.failed("reason"), .failed("reason")), (.finished, .finished),
        ]
        for (source, expected) in statuses {
            let snapshot = try await publishedCall(status: source, mine: [
                .init(text: .init(id: 7, start: 1, end: 2, settled: "settled", pending: " pending")),
            ], theirs: [
                .init(text: .init(id: 7, start: 3, end: 4, settled: "late"), writtenLater: true),
            ])
            let translated = readingText(snapshot)
            #expect(translated == .init(status: expected, entries: [
                .init(id: .init(speaker: .mine, localID: 7), start: 1, end: 2, settled: "settled", pending: " pending"),
                .init(id: .init(speaker: .theirs, localID: 7), start: 3, end: 4, settled: "late", writtenLater: true),
            ]))
        }
        #expect(panelState(.init()) == .init(recording: .off, log: .empty))
        var reading = ReadingState()
        func send(_ event: ReadingEvent) { reading = ReadingReducer.reduce(reading, event).0 }
        send(.recordingChanged(.on(elapsed: 62)))
        #expect(panelState(reading) == .init(recording: .on(elapsed: "00:01:02"), log: .liveTextOff(kept: nil)))
        send(.scrolled(atBottom: false))
        let snapshot = try await publishedCall(status: .listening, mine: [
            .init(text: .init(id: 1, start: 1, end: 2, settled: "settled", pending: " pending")),
        ], theirs: [
            .init(text: .init(id: 1, start: 3, end: 4, settled: "late"), writtenLater: true),
        ])
        send(.textUpdated(readingText(snapshot)))
        send(.hold(.init(entryID: 0, text: "held")))
        let holds = [PanelState.Held(entryID: 0, text: "held")]
        let expected = PanelState.Lines(rows: [
            .entry(.init(id: 0, time: "00:01", speaker: .me, settled: "settled", pending: " pending")),
            .late(.init(span: "00:03–00:04", entries: [.init(id: 1, time: "00:03", speaker: .them, settled: "late")])),
        ], holds: holds, newBelow: 2, followsLive: false)
        #expect(panelState(reading) == .init(recording: .on(elapsed: "00:01:02"), log: .lines(expected)))
        send(.textUpdated(.init(status: .off, entries: [])))
        #expect(panelState(reading).log == .liveTextOff(kept: expected))
        send(.textUpdated(.init(status: .gettingReady, entries: [])))
        #expect(panelState(reading).log == .preparing(holds: holds))
        send(.recordingChanged(.off))
        #expect(panelState(reading).recording == .off)
        for event in [PanelEvent.start, .stop, .switchLiveTextOn] { #expect(readingEvent(event) == nil) }
    }

}
