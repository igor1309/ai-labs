import Testing
import TranscriptLayout

struct TranscriptLayoutFormattingTests {
    @Test(arguments: [0.0, 1.9, 61.9, 3_661.9, 360_000])
    func entryTimesRoundDownAndMinutesContinue(_ value: Double) {
        let expected = [0.0: "00:00", 1.9: "00:01", 61.9: "01:01", 3_661.9: "61:01", 360_000: "6000:00"]
        #expect(TranscriptLayoutFormatting.lineTime(value) == expected[value])
    }
    @Test(arguments: [-1.0, Double.nan, .infinity, -.infinity])
    func invalidTimesAreZero(_ value: Double) {
        #expect(TranscriptLayoutFormatting.lineTime(value) == "00:00")
    }
    @Test func spanUsesBothEndpoints() {
        #expect(TranscriptLayoutFormatting.span("01:02", "63:04") == "01:02–63:04")
    }
}
