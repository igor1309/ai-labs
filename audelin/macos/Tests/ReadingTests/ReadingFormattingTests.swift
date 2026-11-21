import Reading
import Testing

struct ReadingFormattingTests {

    @Test(arguments: [
        (0.0, "00:00:00"),
        (9.99, "00:00:09"),
        (59.99, "00:00:59"),
        (60.0, "00:01:00"),
        (3_661.9, "01:01:01"),
        (360_000.1, "100:00:00"),
    ])
    func elapsedTimeFloorsFractions(value: Double, recording: String) {

        #expect(ReadingFormatting.recordingTime(value) == recording)
    }

    @Test(arguments: [-1.0, -0.1, -Double.infinity, Double.infinity, Double.nan])
    func nonpositiveAndNonfiniteTimesAreZero(_ value: Double) {

        #expect(ReadingFormatting.recordingTime(value) == "00:00:00")
    }

}
