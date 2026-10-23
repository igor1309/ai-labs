import FluidAudio
import ModelLoading

extension NemotronRecognizer {

    /// Loads multilingual Nemotron in 1120 ms chunks for Russian speech,
    /// downloading it the first time.
    public init() async throws {

        self.init(decoder: try await NemotronDecoder())
    }
}

/// The model's cumulative token stream, without language tags.
private struct NemotronDecoder: TokenDecoder {

    private static let models = SharedModel {
        try await StreamingNemotronMultilingualAsrManager.downloadAndPreloadShared(languageCode: "auto", chunkMs: 1120)
    }

    let chunk = 1.12

    private let manager: StreamingNemotronMultilingualAsrManager

    init() async throws {

        let models = try await Self.models.load().value
        let manager = StreamingNemotronMultilingualAsrManager()
        try await manager.loadFromShared(models)
        await manager.setLanguage("ru")
        self.manager = manager
    }

    func feed(_ samples: [Float]) async throws -> [DecodedToken] {

        _ = try await manager.process(samples: samples)
        return tokens(await manager.getTokenTimings())
    }

    func finish() async throws -> [DecodedToken] {

        let result = try await manager.finishWithTokenTimings()
        return tokens(result.timings)
    }

    private func tokens(_ timings: [TokenTiming]) -> [DecodedToken] {

        timings.map { DecodedToken($0.token, start: $0.startTime, end: $0.endTime) }
    }
}
