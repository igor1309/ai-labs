import FluidAudio
import ModelLoading
import Synchronization

extension NemotronRecognizer {

    /// Every recognizer this process builds decodes with the one model load.
    static let decoders = Mutex(sharedDecoders(
        load: {
            try await StreamingNemotronMultilingualAsrManager.downloadAndPreloadShared(languageCode: "auto", chunkMs: 1120)
        },
        makeDecoder: { try await NemotronDecoder(models: $0) }
    ))

    /// Loads multilingual Nemotron in 1120 ms chunks for Russian speech,
    /// downloading it the first time.
    public init() async throws {

        let makeDecoder = Self.decoders.withLock { $0 }
        self.init(decoder: try await makeDecoder())
    }

    /// Builds decoders that all take their models from one load.
    static func sharedDecoders<Model: Sendable>(
        load: @escaping @Sendable () async throws -> Model,
        makeDecoder: @escaping @Sendable (Model) async throws -> any TokenDecoder
    ) -> @Sendable () async throws -> any TokenDecoder {

        let models = SharedModel(load: load)
        return { try await makeDecoder(models.load().value) }
    }
}

/// The model's cumulative token stream, without language tags.
private struct NemotronDecoder: TokenDecoder {

    let chunk = 1.12

    private let manager: StreamingNemotronMultilingualAsrManager

    init(models: SharedNemotronMultilingualModels) async throws {

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
