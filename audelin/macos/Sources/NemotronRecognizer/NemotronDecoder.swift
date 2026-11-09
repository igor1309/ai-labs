import FluidAudio
import ModelLoading

/// Where a recognizer gets its decoder.
public struct NemotronDecoders: Sendable {

    let make: @Sendable () async throws -> any TokenDecoder

    init(make: @escaping @Sendable () async throws -> any TokenDecoder) {

        self.make = make
    }

    /// Multilingual Nemotron in 1120 ms chunks for Russian speech,
    /// downloaded the first time and loaded once for every recognizer this
    /// process builds.
    public static let shared = NemotronDecoders(make: sharedDecoders(
        load: {
            try await StreamingNemotronMultilingualAsrManager.downloadAndPreloadShared(languageCode: "auto", chunkMs: 1120)
        },
        makeDecoder: { try await NemotronDecoder(models: $0) }
    ))

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
struct NemotronDecoder: TokenDecoder {

    let chunk = 1.12

    private let feedTokens: @Sendable ([Float]) async throws -> [TokenTiming]
    private let finishTokens: @Sendable () async throws -> [TokenTiming]

    init(
        feed: @escaping @Sendable ([Float]) async throws -> [TokenTiming],
        finish: @escaping @Sendable () async throws -> [TokenTiming]
    ) {

        feedTokens = feed
        finishTokens = finish
    }

    init(models: SharedNemotronMultilingualModels) async throws {

        let manager = StreamingNemotronMultilingualAsrManager()
        try await manager.loadFromShared(models)
        await manager.setLanguage("ru")
        self.init(
            feed: { samples in
                _ = try await manager.process(samples: samples)
                return await manager.getTokenTimings()
            },
            finish: { try await manager.finishWithTokenTimings().timings }
        )
    }

    func feed(_ samples: [Float]) async throws -> [DecodedToken] {

        tokens(try await feedTokens(samples))
    }

    func finish() async throws -> [DecodedToken] {

        tokens(try await finishTokens())
    }

    private func tokens(_ timings: [TokenTiming]) -> [DecodedToken] {

        timings.map { DecodedToken($0.token, start: $0.startTime, end: $0.endTime) }
    }
}
