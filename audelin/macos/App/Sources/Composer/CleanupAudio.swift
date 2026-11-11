import BleedCleanup
import Foundation

/// The boundary keeps one lazy load, including while another call is waiting for it.
public actor LocalVqeCleaning<Manager: Sendable>: MicrophoneCleaning {
    private struct Loading {
        let id: UUID
        let task: Task<Manager, any Error>
    }
    private var loading: Loading?

    private let makeManager: @Sendable () async throws -> Manager
    private let process: @Sendable (Manager, URL, URL) async throws -> [Float]

    public init(makeManager: @escaping @Sendable () async throws -> Manager,
                process: @escaping @Sendable (Manager, URL, URL) async throws -> [Float]) {
        self.makeManager = makeManager
        self.process = process
    }

    public func clean(_ recording: CleanupRecording) async throws -> [Float] {
        try Task.checkCancellation()
        if loading == nil {
            loading = Loading(id: UUID(), task: Task { try await makeManager() })
        }
        let current = loading!
        let manager: Manager
        do { manager = try await current.task.value }
        catch {
            if loading?.id == current.id { loading = nil }
            throw error
        }
        try Task.checkCancellation()
        return try await process(manager, recording.microphoneURL, recording.callURL)
    }
}

/// Gives Live text contiguous 16 kHz audio and drains its final recognition.
public struct CleanupHearing: CleanedHearing {
    let recognizers: any RecognizerSource

    public init(recognizers: any RecognizerSource) { self.recognizers = recognizers }

    public func hear(_ samples: [Float]) async throws -> [TranscriptSegment]? {
        let text = TrackText(recognizerSource: { BoundaryRecognizer(base: try await recognizers.recognizer(for: .microphone)) })
        do {
            try Task.checkCancellation()
            try await text.prepare()
            let rate = 16_000
            for start in stride(from: 0, to: samples.count, by: rate) {
                try Task.checkCancellation()
                _ = try await text.hear(.init(
                    start: Double(start) / Double(rate),
                    samples: Array(samples[start..<min(start + rate, samples.count)]), sampleRate: Double(rate)
                ))
            }
            try Task.checkCancellation()
            let heard = try await text.finish().all
            try Task.checkCancellation()
            return heard.contains(where: { !$0.words.isEmpty }) ? heard : nil
        } catch {
            await text.shutdown()
            throw error
        }
    }
}
