import Dispatch
import FluidAudio
import LiveText
import ModelLoading

extension ParakeetRecognizer {

    /// Every recognizer this process builds reads with the one model load.
    static let readers = sharedReaders(
        load: { try await AsrModels.downloadAndLoad(version: .v3) },
        makeReader: { try await ParakeetReader(models: $0) }
    )

    /// Loads Parakeet v3, downloading it the first time.
    public init() async throws {

        self.init(reader: try await Self.readers())
    }

    /// Builds readers that all take their model from one load.
    static func sharedReaders<Model: Sendable>(
        loadQueue: DispatchQueue = DispatchQueue(label: "audelin.ParakeetModelLoading"),
        load: @escaping @Sendable () async throws -> Model,
        makeReader: @escaping @Sendable (Model) async throws -> any WindowReader
    ) -> @Sendable () async throws -> any WindowReader {

        let models = SharedModel(loadQueue: loadQueue, load: load)
        return { try await makeReader(models.load().value) }
    }
}

/// Parakeet v3 through FluidAudio, reading each window from a fresh decoder
/// state.
private final class ParakeetReader: WindowReader, @unchecked Sendable {

    private let manager: AsrManager

    init(models: AsrModels) async throws {

        manager = AsrManager(config: .default)
        try await manager.loadModels(models)
    }

    func read(_ samples: [Float]) async throws -> [WindowWord] {

        // The model takes no less than its shortest window; the rest of it is
        // silence, and nothing heard there is in the track.
        let shortest = ASRConstants.minimumRequiredSamples(forSampleRate: 16_000)
        let padded = samples + [Float](repeating: 0, count: max(0, shortest - samples.count))
        var state = TdtDecoderState.make()
        let result = try await manager.transcribe(padded, decoderState: &state)
        let duration = Double(samples.count) / 16_000
        return words(result.tokenTimings ?? []).filter { $0.start < duration }
    }

    /// Joins tokens into words: a token starting with a space starts a word.
    private func words(_ timings: [TokenTiming]) -> [WindowWord] {

        var words: [WindowWord] = []
        for timing in timings {
            if timing.token.hasPrefix(" ") || words.isEmpty {
                words.append(WindowWord(timing.token.trimmingCharacters(in: .whitespaces), start: timing.startTime, end: timing.endTime))
            } else {
                words[words.count - 1].text += timing.token
                words[words.count - 1].end = timing.endTime
            }
        }
        return words.filter { !$0.text.isEmpty }
    }
}
