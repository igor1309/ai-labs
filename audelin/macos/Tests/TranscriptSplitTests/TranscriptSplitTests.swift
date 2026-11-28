import Foundation
import Testing
import TranscriptSplit

struct TranscriptSplitTests {
    @Test func rebasesTheSecondPartAndKeepsRowContentsAndOrder() {
        let start = Date(timeIntervalSince1970: 1_800_000_040.125)
        let rows = [Row(1, "first"), Row(8, "gap", gap: 2), Row(10, "at cut", "a"),
                    Row(10, "same time"), Row(12, "later", "b")]
        let result = TranscriptSplit.split(timelineStart: start, at: 10, rows: rows, speakers: [Speaker](),
                                           originals: [TranscriptSplit.Original<String>]())

        #expect(result.before.timelineStart == start)
        #expect(result.after.timelineStart == Date(timeIntervalSince1970: 1_800_000_050.125))
        #expect(result.before.rows == [Row(1, "first"), Row(8, "gap", gap: 2)])
        #expect(result.after.rows == [Row(0, "at cut", "a"), Row(0, "same time"), Row(2, "later", "b")])
    }

    @Test func keepsOnlyTheSpeakersEachPartUsesInTheirOriginalOrder() {
        let first = Speaker(key: "first", name: "Alice"), shared = Speaker(key: "shared", name: "Sam")
        let last = Speaker(key: "last", name: "Alice"), unused = Speaker(key: "unused", name: "Unused")
        let rows = [Row(1, "first", "first"), Row(3, "both", "shared"), Row(8, "me"), Row(11, "last", "last"),
                    Row(12, "both again", "shared")]
        let result = TranscriptSplit.split(timelineStart: .distantPast, at: 10, rows: rows,
                                           speakers: [shared, unused, first, last], originals: [TranscriptSplit.Original<String>]())

        #expect(result.before.speakers == [shared, first])
        #expect(result.after.speakers == [shared, last])
    }

    @Test func plansWholeAndSpanningOriginalsOnBothPartsClocks() {
        let start = Date(timeIntervalSince1970: 100)
        let originals = [original(101, 9, "ends at cut"), original(104.5, 9, "spans cut"),
                         original(110, 2, "starts at cut"), original(116, 4, "starts later")]
        let result = TranscriptSplit.split(timelineStart: start, at: 10, rows: [Row](), speakers: [Speaker](), originals: originals)

        #expect(result.before.recordings.map { range($0, in: result.before.timelineStart) } == [
            RangeDescription(origin: "ends at cut", originalStart: 101, originalLength: 9, start: 1, offset: 0, length: 9),
            RangeDescription(origin: "spans cut", originalStart: 104.5, originalLength: 9, start: 4.5, offset: 0, length: 5.5),
        ])
        #expect(result.after.recordings.map { range($0, in: result.after.timelineStart) } == [
            RangeDescription(origin: "spans cut", originalStart: 104.5, originalLength: 9, start: 0, offset: 5.5, length: 3.5),
            RangeDescription(origin: "starts at cut", originalStart: 110, originalLength: 2, start: 0, offset: 0, length: 2),
            RangeDescription(origin: "starts later", originalStart: 116, originalLength: 4, start: 6, offset: 0, length: 4),
        ])
    }

    private struct Row: SplitRow, Equatable {
        let time: Double
        let text: String
        let speaker: String?
        let gap: Double?

        init(_ time: Double, _ text: String, _ speaker: String? = nil, gap: Double? = nil) {
            self.time = time; self.text = text; self.speaker = speaker; self.gap = gap
        }

        func moved(to time: Double) -> Self { Self(time, text, speaker, gap: gap) }
    }

    private struct Speaker: SplitSpeaker, Equatable {
        let key: String
        let name: String
    }

    private func original(_ start: Double, _ length: Double, _ origin: String) -> TranscriptSplit.Original<String> {
        .init(start: Date(timeIntervalSince1970: start), length: length, origin: origin)
    }

    private struct RangeDescription: Equatable {
        let origin: String
        let originalStart: Double
        let originalLength: Double
        let start: Double
        let offset: Double
        let length: Double
    }

    private func range(_ range: TranscriptSplit.RecordingRange<String>, in timeline: Date) -> RangeDescription {
        RangeDescription(origin: range.original.origin, originalStart: range.original.start.timeIntervalSince1970,
                         originalLength: range.original.length, start: range.start.timeIntervalSince(timeline),
                         offset: range.sourceOffset, length: range.length)
    }
}
