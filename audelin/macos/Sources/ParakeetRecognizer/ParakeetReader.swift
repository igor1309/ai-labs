import FluidAudio
import LiveText

extension ParakeetRecognizer {

    /// Loads Parakeet v3, downloading it the first time.
    public init() async throws {

        self.init(reader: try await ParakeetReader())
    }
}

/// Parakeet v3 through FluidAudio, reading each window from a fresh decoder
/// state.
private final class ParakeetReader: WindowReader, @unchecked Sendable {

    private let manager: AsrManager

    init() async throws {

        manager = AsrManager(config: .default)
        try await manager.loadModels(try await AsrModels.downloadAndLoad(version: .v3))
    }

    func read(_ samples: [Float]) async throws -> [Word] {

        var state = TdtDecoderState.make()
        let result = try await manager.transcribe(samples, decoderState: &state)
        return words(result.tokenTimings ?? [])
    }

    /// Joins tokens into words: a token starting with a space starts a word.
    private func words(_ timings: [TokenTiming]) -> [Word] {

        var words: [Word] = []
        for timing in timings {
            if timing.token.hasPrefix(" ") || words.isEmpty {
                words.append(Word(timing.token.trimmingCharacters(in: .whitespaces), start: timing.startTime, end: timing.endTime))
            } else {
                words[words.count - 1].text += timing.token
                words[words.count - 1].end = timing.endTime
            }
        }
        return words.filter { !$0.text.isEmpty }
    }
}
