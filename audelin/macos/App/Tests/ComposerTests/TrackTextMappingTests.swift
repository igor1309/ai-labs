@testable import Composer
@testable import LiveText
import struct SideText.Text
import Testing

@Suite(.timeLimit(.minutes(1)))
struct TrackTextMappingTests {

    @Test func aSegmentRunsToTheNextStartAndTheLastToTheEnd() {

        let first = Segments.Segment(id: 7, start: 1.25, settled: "one", pending: "two")
        let second = Segments.Segment(id: 3, start: 6.5, settled: "", pending: "три")
        let last = Segments.Segment(id: 9, start: 10, settled: "four", pending: "")
        let cases: [([Segments.Segment], Double, [Text])] = [
            ([], 0, []),
            ([first], 4, [.init(id: 7, start: 1.25, end: 4, settled: "one", pending: "two")]),
            ([first, second, last], 12, [
                .init(id: 7, start: 1.25, end: 6.5, settled: "one", pending: "two"),
                .init(id: 3, start: 6.5, end: 10, pending: "три"),
                .init(id: 9, start: 10, end: 12, settled: "four"),
            ]),
        ]
        for (segments, end, expected) in cases {
            #expect(TrackText.text(from: segments, through: end) == expected)
        }
    }
}
