import FluidAudio

/// What the binding reports: a model's own speaker name and times.
public struct EngineTurn: Equatable, Sendable {
    public let speaker: String
    public let start: Double
    public let end: Double
    public init(speaker: String, start: Double, end: Double) { self.speaker = speaker; self.start = start; self.end = end }
}

public protocol DiarizationBinding: Sendable {
    /// Nemotron's speaker slots (8 for fast128).
    var nemotronSlots: Int { get }
    /// Loads Nemotron; throws when it cannot. The returned run throws when diarizing fails.
    func loadNemotron() async throws -> @Sendable ([Float]) async throws -> [EngineTurn]
    /// Loads and runs VBx on 16 kHz samples, for `speakers` speakers when given.
    /// A track with no speech returns no turns.
    func vbx(_ samples: [Float], speakers: Int?) async throws -> [EngineTurn]
}

/// The real binding over FluidAudio.
public struct FluidDiarizationBinding: DiarizationBinding {

    public init() {}

    public var nemotronSlots: Int { Nemotron3Config.fast128.numSpeakers }

    public func loadNemotron() async throws -> @Sendable ([Float]) async throws -> [EngineTurn] {

        let engine = try await NemotronEngine()
        return { try await engine.run($0) }
    }

    public func vbx(_ samples: [Float], speakers: Int?) async throws -> [EngineTurn] {

        var config = OfflineDiarizerConfig.default
        config.clustering.numSpeakers = speakers
        let manager = OfflineDiarizerManager(config: config)
        try await manager.prepareModels()
        do {
            return try await manager.process(audio: samples).segments.map {
                EngineTurn(speaker: $0.speakerId, start: Double($0.startTimeSeconds), end: Double($0.endTimeSeconds))
            }
        } catch OfflineDiarizationError.noSpeechDetected {
            return []
        }
    }
}

/// FluidAudio's mutable Nemotron instance must not run concurrently.
private actor NemotronEngine {

    private let diarizer: Nemotron3Diarizer

    init() async throws {

        let config = Nemotron3Config.fast128
        let models = try await Nemotron3Models.loadFromHuggingFace(config: config)
        diarizer = Nemotron3Diarizer(config: config, models: models)
    }

    func run(_ samples: [Float]) throws -> [EngineTurn] {

        let (probabilities, frames) = try diarizer.processComplete(samples)
        return Nemotron3Diarizer.segments(
            probabilities: probabilities, frameCount: frames, numSpeakers: diarizer.config.numSpeakers
        ).map {
            EngineTurn(speaker: String($0.speakerIndex), start: Double($0.startSeconds), end: Double($0.endSeconds))
        }
    }
}
