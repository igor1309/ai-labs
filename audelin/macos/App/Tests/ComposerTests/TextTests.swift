import Composer
import Foundation
import LiveText
import PanelUI
import SessionRehearsal
import Testing

/// Live text from recogniser to panel and transcript, through the composition.
@MainActor
@Suite(.timeLimit(.minutes(1)))
struct TextTests {

    @Test func hearsOneUpdatePerChunkAndFinishesWithTheLastRevision() async throws {

        let recognizer = ScriptRecognizer(hearings: [
            .success(.init(words: [.init("one.", start: 0.5, end: 1)])),
            .success(.init(words: [.init("two", start: 3.5, end: 4)], finalThrough: 1)),
        ], endings: [.success(.init(words: [.init("last", start: 3.5, end: 4)]))])
        let microphone = FedCapture()
        defer { microphone.end() }
        try await withComposition(recognizers: (recognizer, SessionRecognizer(name: "theirs")), configure: { boundary in
            boundary.microphone = FixtureMicrophone { microphone.started }
        }) { rig in
            try await rig.start()
            microphone.send([0.25, 0.5])
            _ = try await rig.panel { entries(of: $0).contains { $0.speaker == .me && $0.pending == "one." } }
            microphone.send([0.125, -0.5, 0.5, 0.25], rate: 24_000)
            _ = try await rig.panel { state in
                let mine = entries(of: state).filter { $0.speaker == .me }
                return mine.map(\.settled) == ["one.", ""] && mine.last?.pending == "two"
            }
            try await rig.stop()
            #expect(await recognizer.chunks == [
                AudioChunk(samples: [0.25, 0.5], sampleRate: 48_000),
                AudioChunk(samples: [0.125, -0.5, 0.5, 0.25], sampleRate: 24_000),
            ])
            #expect(await recognizer.finishes == 1)
            let transcript = try await transcriptText(of: rig)
            #expect(transcript.contains("one.") && transcript.contains("last"))
            #expect(!transcript.contains("two"))
        }
    }

    @Test func aFailedLastUpdateKeepsTheWordsHeardAndStillEndsTheSession() async throws {

        let recognizer = ScriptRecognizer(hearings: [
            .success(.init(words: [.init("kept", start: 0, end: 1)])),
            .success(.init(words: [.init("kept", start: 0, end: 1)])),
        ], endings: [.failure(.failed)])
        try await withComposition(recognizers: (recognizer, SessionRecognizer(name: "theirs"))) { rig in
            try await rig.start()
            _ = try await rig.panel { entries(of: $0).contains { $0.pending == "kept" } }
            try await rig.stop()
            #expect(await recognizer.finishes == 1)
            let transcript = try await transcriptText(of: rig)
            #expect(transcript.contains("kept") && transcript.contains("theirs final"))
        }
    }

    /// Text is only heard while a session lasts: when it ends, each side has
    /// finished its recogniser once and let it go, though the app goes on.
    @Test func anEndedSessionFinishesAndReleasesItsRecognizers() async throws {

        let released = Signal(), finishes = Values<Bool>()
        defer { released.end() }
        try await withComposition(configure: { boundary in
            boundary.recognizers = FixtureRecognizers(source: { _ in
                RehearsalRecognizer(LifetimeRecognizer(released: released, finishes: finishes))
            }, missing: { [] }, load: { Task {} })
        }) { rig in
            try await rig.start()
            try await rig.stop()
            await released.next()
            await released.next()
            #expect(finishes.all == [true, true])
        }
    }

    /// Words read back from the track show the time their segments ran for,
    /// through the last one's own end.
    @Test func textSwitchedOnLaterSpansItsSegments() async throws {

        let hearing = Hearing(words: [.init("one.", start: 60, end: 61), .init("two.", start: 150, end: 200)], finalThrough: 61)
        let microphone = FedCapture()
        defer { microphone.end() }
        try await withComposition(preferences: { .init(automaticRecording: false, liveText: false, callsFolder: $0) },
            recognizers: (SameHearing(hearing: hearing), SessionRecognizer(name: "theirs")), configure: { boundary in
                boundary.microphone = FixtureMicrophone {
                    microphone.send(Array(repeating: 0, count: 20_000), rate: 100)
                    return microphone.started
                }
            }) { rig in
            try await rig.start()
            await rig.menu.sendPanel(.switchLiveTextOn)
            let shown = try await rig.panel { lateGroup(in: $0, holding: "two.") != nil }
            #expect(lateGroup(in: shown, holding: "two.")?.span.hasSuffix("–03:20") == true)
            try await rig.stop()
        }
    }
}

private func lateGroup(in state: PanelState, holding pending: String) -> PanelState.Late? {

    guard case let .lines(lines) = state.log else { return nil }
    for row in lines.rows {
        if case let .late(group) = row, group.entries.contains(where: { $0.pending == pending }) { return group }
    }
    return nil
}

/// Answers every chunk, however the track is read back, with the same words.
private struct SameHearing: Recognizer {

    let hearing: Hearing
    func hear(_ chunk: AudioChunk) async throws -> Hearing { hearing }
    func finish() async throws -> Hearing { hearing }
}
