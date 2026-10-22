import LiveSessionCore
import Testing

@Suite struct RecordedAudioTests {
    @Test func audioEndsAfterItsSamples() {
        let audio = RecordedAudio(epoch: 1, start: 20, sampleRate: 16_000, samples: Array(repeating: 0, count: 8_000))

        #expect(audio.end == 20.5)
    }
}
