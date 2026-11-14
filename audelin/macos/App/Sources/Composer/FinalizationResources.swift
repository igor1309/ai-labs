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
    private var draining: [CheckedContinuation<Void, Never>] = []

    func add(call: String, transcript: OpenedTranscript, cleanup: TranscriptCleanup,
             speakers: @escaping @Sendable ([Int: Int]) async -> Void,
             finishReading: @escaping @Sendable () async -> Void) {
        calls[call] = Resource(transcript: transcript, cleanup: cleanup, speakers: speakers, finishReading: finishReading)
    }

    func resource(call: String) -> Resource? { calls[call] }

    func showSpeakers(_ state: TranscriptFinalizationModel.State) async {
        for (call, value) in state.calls {
            if let rows = value.far?.rows, !rows.isEmpty { await calls[call]?.speakers(rows) }
        }
    }

    /// Publication releases the handles only after its consumers have accepted the final form.
    func published(call: String) async {
        guard let resource = calls.removeValue(forKey: call) else { return }
        await resource.finishReading()
        if calls.isEmpty {
            let waiting = draining
            draining.removeAll()
            for answer in waiting { answer.resume() }
        }
    }

    /// Quit keeps final transcript delivery ahead of the summaries machine's shutdown.
    func drain() async {
        if !calls.isEmpty { await withCheckedContinuation { draining.append($0) } }
    }
}
