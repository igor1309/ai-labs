import Foundation

/// Per-call handles only. The machine holds every stage and every transcript value.
@MainActor
final class FinalizationResources {
    struct Resource: Sendable {
        let transcript: OpenedTranscript
        let cleanup: TranscriptCleanup
        let speakers: @Sendable ([Int: Int]) async -> Void
        let finishReading: @Sendable () async -> Void
    }

    private var calls: [String: Resource] = [:]
    /// The running cleanup of each call, and the calls whose cleanup was stopped.
    private var cleaning: [String: Task<[TranscriptSegment]?, Never>] = [:]
    private var stopped: Set<String> = []

    func add(call: String, transcript: OpenedTranscript, cleanup: TranscriptCleanup,
             speakers: @escaping @Sendable ([Int: Int]) async -> Void,
             finishReading: @escaping @Sendable () async -> Void) {
        calls[call] = Resource(transcript: transcript, cleanup: cleanup, speakers: speakers, finishReading: finishReading)
    }

    func resource(call: String) -> Resource? { calls[call] }

    /// Starts the call's cleanup unless it was stopped already; nil when there is nothing to run.
    func startCleaning(call: String, _ raw: CallState) -> Task<[TranscriptSegment]?, Never>? {
        guard let resource = calls[call], !stopped.contains(call) else { return nil }
        let work = Task { await resource.cleanup.run(raw) }
        cleaning[call] = work
        return work
    }

    func stopCleaning(call: String) {
        stopped.insert(call)
        cleaning.removeValue(forKey: call)?.cancel()
    }

    func showSpeakers(_ state: TranscriptFinalizationModel.State) async {
        for (call, value) in state.calls {
            if let rows = value.far?.rows, !rows.isEmpty { await calls[call]?.speakers(rows) }
        }
    }

    /// Publication releases the handles only after its consumers have accepted the final form.
    func published(call: String) async {
        guard let resource = calls.removeValue(forKey: call) else { return }
        cleaning.removeValue(forKey: call)
        stopped.remove(call)
        await resource.finishReading()
    }
}
