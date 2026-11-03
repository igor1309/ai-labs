import FluidAudio
import Testing
@testable import NemotronRecognizer

struct NemotronDecoderTests {

    @Test func feedAndFinishPreserveCumulativeTokensAndExactTimings() async throws {

        // Synthetic snapshots, including a continuation and a word marker.
        let first = [timing("▁При", 0.125, 0.25)]
        let second = first + [timing("вет", 0.25, 0.375)]
        let final = second + [timing(" мир!", 0.5, 0.875)]
        let spy = DecoderSpy(replies: [first, second], finished: final)
        let decoder = NemotronDecoder(feed: { try await spy.feed($0) }, finish: { try await spy.finish() })
        let samples: [[Float]] = [[0.25, -0.75], []]

        #expect(decoder.chunk == 1.12)
        #expect(try await decoder.feed(samples[0]) == [DecodedToken("▁При", start: 0.125, end: 0.25)])
        #expect(try await decoder.feed(samples[1]) == [
            DecodedToken("▁При", start: 0.125, end: 0.25), DecodedToken("вет", start: 0.25, end: 0.375),
        ])
        #expect(try await decoder.finish() == [
            DecodedToken("▁При", start: 0.125, end: 0.25), DecodedToken("вет", start: 0.25, end: 0.375),
            DecodedToken(" мир!", start: 0.5, end: 0.875),
        ])
        #expect(await spy.samples == samples)
        #expect(await spy.finishes == 1)
    }

    @Test func emptyTimingsStayEmpty() async throws {

        let decoder = NemotronDecoder(feed: { _ in [] }, finish: { [] })

        #expect(try await decoder.feed([0.25]) == [])
        #expect(try await decoder.finish() == [])
    }

    @Test func feedAndFinishFailuresReachTheCaller() async {

        let decoder = NemotronDecoder(feed: { _ in throw DecoderFailed.feed }, finish: { throw DecoderFailed.finish })

        await #expect(throws: DecoderFailed.feed) { try await decoder.feed([0.25]) }
        await #expect(throws: DecoderFailed.finish) { try await decoder.finish() }
    }
}

private enum DecoderFailed: Error { case feed, finish }

private actor DecoderSpy {
    private var replies: [[TokenTiming]]
    private let finished: [TokenTiming]
    private(set) var samples: [[Float]] = []
    private(set) var finishes = 0

    init(replies: [[TokenTiming]], finished: [TokenTiming]) {
        self.replies = replies
        self.finished = finished
    }

    func feed(_ samples: [Float]) throws -> [TokenTiming] {
        self.samples.append(samples)
        return replies.removeFirst()
    }

    func finish() throws -> [TokenTiming] {
        finishes += 1
        return finished
    }
}

private func timing(_ token: String, _ start: Double, _ end: Double) -> TokenTiming {
    TokenTiming(token: token, tokenId: 0, startTime: start, endTime: end, confidence: 1)
}
