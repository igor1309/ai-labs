import Reading
import Testing

struct ReadingFormattingTests {

    @Test(arguments: [
        (0.0, "00:00:00", "00:00"),
        (9.99, "00:00:09", "00:09"),
        (59.99, "00:00:59", "00:59"),
        (60.0, "00:01:00", "01:00"),
        (3_661.9, "01:01:01", "61:01"),
        (360_000.1, "100:00:00", "6000:00"),
    ])
    func elapsedTimeFloorsFractions(value: Double, recording: String, line: String) {
        #expect(ReadingFormatting.recordingTime(value) == recording)
        #expect(ReadingFormatting.lineTime(value) == line)
    }

    @Test(arguments: [-1.0, -0.1, -Double.infinity, Double.infinity, Double.nan])
    func nonpositiveAndNonfiniteTimesAreZero(_ value: Double) {
        #expect(ReadingFormatting.recordingTime(value) == "00:00:00")
        #expect(ReadingFormatting.lineTime(value) == "00:00")
    }

    @Test func spanJoinsTheSuppliedStringsWithAnEnDash() {
        #expect(ReadingFormatting.span("01:02", "63:04") == "01:02–63:04")
        #expect(ReadingFormatting.span("start", "end") == "start–end")
    }
}
