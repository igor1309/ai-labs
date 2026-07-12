import FolioTellCore
import Testing

struct SpeechSpeedTests {

    @Test func test_allCases_shouldExposeFiveSpecPresets() {

        #expect(SpeechSpeed.allCases.map(\.rawValue) == ["1x", "1.25x", "1.5x", "1.75x", "2x"])
    }

    @Test func test_utteranceRate_shouldBeDistinct_forEachPreset() {

        #expect(Set(SpeechSpeed.allCases.map(\.utteranceRate)).count == SpeechSpeed.allCases.count)
    }

    @Test func test_utteranceRate_shouldIncreaseWithPresets() {

        #expect(SpeechSpeed.allCases.map(\.utteranceRate) == SpeechSpeed.allCases.map(\.utteranceRate).sorted())
    }

    @Test func test_speed_shouldReturnDefault_onUnknownValue() {

        #expect(SpeechSpeed.speed(for: "fast") == .one)
    }
}
