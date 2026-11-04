import Composer
import LiveText
import Testing
@testable import Audelin

@Suite(.timeLimit(.minutes(1)))
struct RealRecognizerTests {

    private let hearing = Hearing(words: [Word("hi", start: 1, end: 2), Word("there", start: 2, end: 3)],
                                  from: 0.5, finalThrough: 2, noWordBefore: 3.5)
    private let expected = SpeechHearing(words: [SpeechWord("hi", start: 1, end: 2), SpeechWord("there", start: 2, end: 3)],
                                         from: 0.5, finalThrough: 2, noWordBefore: 3.5)

    @Test func hearPassesTheAudioAndCarriesEveryFieldOver() async throws {
        let base = FakeRecognizer(hearing: hearing)

        let result = try await RealRecognizer(base: base).hear(SpeechAudio(samples: [0.5], sampleRate: 16_000))

        #expect(result == expected)
        #expect(await base.chunks == [AudioChunk(samples: [0.5], sampleRate: 16_000)])
    }

    @Test func finishCarriesEveryFieldOver() async throws {
        let result = try await RealRecognizer(base: FakeRecognizer(hearing: hearing)).finish()

        #expect(result == expected)
    }
}

private actor FakeRecognizer: Recognizer {
    let hearing: Hearing
    private(set) var chunks: [AudioChunk] = []

    init(hearing: Hearing) { self.hearing = hearing }

    func hear(_ chunk: AudioChunk) -> Hearing {
        chunks.append(chunk)
        return hearing
    }
    func finish() -> Hearing { hearing }
}
