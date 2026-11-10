import BleedCleanup
import FluidAudio
import Foundation

/// The boundary keeps one lazy load, including while another call is waiting for it.
public actor LocalVqeCleaning: MicrophoneCleaning {
    private struct Loading {
        let id: UUID
        let task: Task<LocalVqeManager, any Error>
    }
    private var loading: Loading?

    public init() {}

    public func clean(_ recording: CleanupRecording) async throws -> [Float] {
        if loading == nil {
            loading = Loading(id: UUID(), task: Task { try await LocalVqeManager() })
        }
        let current = loading!
        let manager: LocalVqeManager
        do { manager = try await current.task.value }
        catch {
            if loading?.id == current.id { loading = nil }
            throw error
        }
        return try await manager.process(micURL: recording.microphoneURL, referenceURL: recording.callURL)
    }
}

/// Gives Live text contiguous 16 kHz audio and drains its final recognition.
public struct CleanupHearing: CleanedHearing {
    let recognizers: any RecognizerSource

    public init(recognizers: any RecognizerSource) { self.recognizers = recognizers }

    public func hear(_ samples: [Float]) async throws -> [TranscriptSegment]? {
        let text = TrackText(recognizerSource: { BoundaryRecognizer(base: try await recognizers.recognizer(for: .microphone)) })
        do {
            try await text.prepare()
            let rate = 16_000
            for start in stride(from: 0, to: samples.count, by: rate) {
                _ = try await text.hear(.init(
                    start: Double(start) / Double(rate),
                    samples: Array(samples[start..<min(start + rate, samples.count)]), sampleRate: Double(rate)
                ))
            }
            let heard = try await text.finish().all
            return heard.contains(where: { !$0.words.isEmpty }) ? heard : nil
        } catch {
            await text.shutdown()
            throw error
        }
    }
}
