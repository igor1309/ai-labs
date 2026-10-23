import PanelUI
import Testing
@testable import LiveTextPreview

struct TranscriptTests {

    @Test func bothTracksReadInTimeOrder() {

        var transcript = Transcript()
        transcript.update(.me, [line(0, 0, "привет"), line(1, 9, "да")])
        transcript.update(.them, [line(0, 4, "здравствуйте", pending: "как")])

        #expect(transcript.entries.map(\.speaker) == [.me, .them, .me])
        #expect(transcript.entries.map(\.time) == ["00:00", "00:04", "00:09"])
        #expect(transcript.entries[1].pending == "как")
    }

    @Test func eachTracksSegmentKeepsItsOwnEntry() {

        var transcript = Transcript()
        transcript.update(.me, [line(0, 0, "а")])
        transcript.update(.them, [line(0, 0, "б")])

        #expect(Set(transcript.entries.map(\.id)).count == 2)
        #expect(transcript.entries.map(\.settled) == ["а", "б"])
    }

    @Test func aNewReportReplacesTheTrack() {

        var transcript = Transcript()
        transcript.update(.me, [line(0, 0, "", pending: "по")])
        transcript.update(.me, [line(0, 0, "по запуску")])

        #expect(transcript.entries.map(\.settled) == ["по запуску"])
    }

    @Test func clockShowsMinutesAndSeconds() {

        #expect(clock(67.9) == "01:07")
    }

    private func line(_ id: Int, _ start: Double, _ settled: String, pending: String = "") -> Transcript.Line {

        .init(id: id, start: start, settled: settled, pending: pending)
    }
}
