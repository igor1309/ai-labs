import BlockingTestWork
import Dispatch
import Foundation
import Testing
@testable import ParakeetRecognizer

struct ParakeetContractTests {

    /// Contract test: the pinned FluidAudio Parakeet v3 model over committed 16 kHz mono speech.
    @Test func recognizesKnownWordsWithOrderedTimingsThroughProductionBinding() async throws {

        let url = try await offPool { try #require(Bundle.module.url(forResource: "diff-means", withExtension: "wav", subdirectory: "Fixtures")) }
        let audio = try await audioFile(url)
        #expect(audio.sampleRate == 16_000)
        #expect(audio.channelCount == 1)
        let duration = Double(audio.samples.count) / audio.sampleRate
        let words = try await withTaskExecutorPreference(DispatchSerialQueue(label: "test.ParakeetContract")) {
            let reader = try await ParakeetRecognizer.readers()
            return try await reader.read(audio.samples)
        }

        #expect(words.map { $0.text.lowercased().filter(\.isLetter) } == [
            "diff", "means", "comparing",
        ])
        for word in words {
            #expect(word.start.isFinite && word.end.isFinite)
            #expect(word.start >= 0 && word.start < word.end && word.end <= duration + 0.25)
        }
        for (previous, next) in zip(words, words.dropFirst()) {
            #expect(previous.start <= next.start)
            #expect(previous.end <= next.end)
        }
    }
}
