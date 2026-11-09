import BlockingTestWork
import Dispatch
import Foundation
import Testing
@testable import FluidAudio
@testable import ParakeetRecognizer

struct ParakeetReaderTests {

    @Test func capturedParakeetTokensBecomeWordsWithTheirOriginalTimings() async throws {

        let timings: [TokenTiming] = try {
            let url = try #require(Bundle.module.url(forResource: "diff-means-parakeet-v3", withExtension: "json", subdirectory: "Fixtures"))
            return try JSONDecoder().decode([TokenTiming].self, from: Data(contentsOf: url))
        }()
        let reader = ParakeetReader(transcribe: { _, _ in timings })

        let words = try await read(reader, samples: .init(repeating: 0, count: 88_000))

        #expect(words == [
            WindowWord("Diff", start: 1.2, end: 1.68),
            WindowWord("means", start: 2, end: 2.4),
            WindowWord("comparing", start: 3.68, end: 4.880000000000001),
        ])
    }

    @Test func leadingSpacesStartWordsAndContinuationPiecesExtendTheirEnds() async throws {

        // Synthetic boundary cases; the model capture is tested separately.
        let timings = [
            timing("First", 0.1, 0.2), timing("piece", 0.2, 0.35),
            timing(" ", 0.4, 0.45), timing("\t", 0.45, 0.5),
            timing(" next", 0.6, 0.7), timing("!", 0.7, 0.8),
        ]
        let reader = ParakeetReader(transcribe: { _, _ in timings })

        let words = try await read(reader, samples: .init(repeating: 0, count: 16_000))

        #expect(words == [WindowWord("Firstpiece", start: 0.1, end: 0.35), WindowWord("next!", start: 0.6, end: 0.8)])
    }

    @Test func wordsStartingAtOrBeyondTheOriginalDurationAreOmitted() async throws {

        let reader = ParakeetReader(transcribe: { _, _ in [
            timing(" before", 0.499, 0.7), timing(" boundary", 0.5, 0.8), timing(" after", 0.6, 0.9),
        ] })

        #expect(try await read(reader, samples: .init(repeating: 0, count: 8_000)) == [WindowWord("before", start: 0.499, end: 0.7)])
        #expect(try await read(reader, samples: []) == [])
    }

    @Test(arguments: [" ", "\t", "\n", " \t\r\n", "\u{00a0}"])
    func whitespaceOnlyWordsAreOmitted(_ whitespace: String) async throws {

        let reader = ParakeetReader(transcribe: { _, _ in [
            timing(" ", 0.1, 0.2), timing(whitespace, 0.2, 0.3),
            timing(" word", 0.4, 0.5),
            timing(" ", 0.6, 0.7), timing(whitespace, 0.7, 0.8),
        ] })

        #expect(try await read(reader, samples: .init(repeating: 0, count: 16_000)) == [
            WindowWord("word", start: 0.4, end: 0.5),
        ])
    }

    @Test func paddingPreservesSamplesAndAddsOnlyTheMissingSilence() async throws {

        let minimum = ASRConstants.minimumRequiredSamples(forSampleRate: 16_000)
        for count in [0, 3, minimum - 1, minimum, minimum + 1] {
            let samples = (0..<count).map { Float($0 % 17) / 17 }
            let spy = TranscriptionSpy()
            let reader = ParakeetReader(transcribe: { samples, _ in await spy.record(samples); return [] })

            _ = try await read(reader, samples: samples)

            let calls = await spy.samples
            try #require(calls.count == 1)
            #expect(calls[0].elementsEqual(samples + .init(repeating: 0, count: max(0, minimum - count))))
        }
    }

    @Test func eachWindowGetsFreshStateAfterThePreviousTranscriptionMutatedIt() async throws {

        let spy = TranscriptionSpy()
        let reader = ParakeetReader(transcribe: { samples, state in
            #expect(state.hiddenState.shape.map(\.intValue) == [2, 1, ASRConstants.decoderHiddenSize])
            #expect(state.cellState.shape.map(\.intValue) == [2, 1, ASRConstants.decoderHiddenSize])
            #expect(state.hiddenState[0].floatValue == 0)
            #expect(state.cellState[0].floatValue == 0)
            #expect(state.lastToken == nil)
            #expect(state.timeJump == nil)
            #expect(state.predictorOutput == nil)
            state.hiddenState[0] = 42
            state.cellState[0] = 43
            state.lastToken = 123
            state.timeJump = 9
            state.predictorOutput = state.hiddenState
            await spy.record(samples)
            return []
        })

        for _ in 0..<3 { _ = try await read(reader, samples: [0.25]) }

        #expect(await spy.samples.count == 3)
    }

    @Test func transcriptionFailuresReachTheCaller() async {

        let reader = ParakeetReader(transcribe: { _, _ in throw TranscriptionFailed.failed })

        await #expect(throws: TranscriptionFailed.failed) { try await read(reader, samples: [0.25]) }
    }

    private func read(_ reader: ParakeetReader, samples: [Float]) async throws -> [WindowWord] {

        try await reader.read(samples)
    }
}

private enum TranscriptionFailed: Error { case failed }

private actor TranscriptionSpy {
    private(set) var samples: [[Float]] = []
    func record(_ samples: [Float]) { self.samples.append(samples) }
}

private func timing(_ token: String, _ start: Double, _ end: Double) -> TokenTiming {
    TokenTiming(token: token, tokenId: 0, startTime: start, endTime: end, confidence: 1)
}
