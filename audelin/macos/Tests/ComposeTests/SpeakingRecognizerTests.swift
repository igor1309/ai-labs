import LiveText
import SessionRehearsal
import Testing

struct SpeakingRecognizerTests {

    @Test func speaksInSentencesWithPausesBetween() async {

        let speaker = SpeakingRecognizer(name: "w", sentence: 8, pause: 4, offset: 0)

        _ = await speaker.hear(second(of: 24))

        // Two 8 s sentences a word every 0.4 s, and nothing in the pauses.
        #expect(await speaker.words == 40)
    }

    @Test func aMonologueSpeaksThroughThePauses() async {

        let speaker = SpeakingRecognizer(name: "w", sentence: 8, pause: 4, offset: 0, monologue: .init(every: 24, length: 12))

        _ = await speaker.hear(second(of: 24))

        // The first 12 s keep their one pause; the monologue's 12 s have none.
        #expect(await speaker.words == 20 + 30)
    }

    private func second(of seconds: Int) -> AudioChunk {

        AudioChunk(samples: .init(repeating: 0, count: seconds * 1_000), sampleRate: 1_000)
    }
}
