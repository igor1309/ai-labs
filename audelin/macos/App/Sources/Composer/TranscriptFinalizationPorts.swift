import CallNames
import SummaryJobs
import TranscriptFinalization

struct FinalizationDiarizing: TranscriptDiarizing {
    let resources: FinalizationResources

    func diarize(call: String, _ raw: CallState) async -> Transcript.Attributed? {
        guard let resource = await resources.resource(call: call) else { return nil }
        let far = await resource.transcript.pass.diarize(call: call, raw)
        return far
    }
}

struct FinalizationCleanup: MicrophoneCleanup {
    let resources: FinalizationResources

    func clean(call: String, _ raw: CallState, far: Transcript.Attributed?) async -> [TranscriptSegment]? {
        guard let work = await resources.startCleaning(call: call, raw) else { return nil }
        return await withTaskCancellationHandler { await work.value } onCancel: { work.cancel() }
    }

    func stop(call: String) async { await resources.stopCleaning(call: call) }
}

struct FinalizationReplacement: TranscriptReplacement {
    let resources: FinalizationResources

    func replace(call: String, _ raw: CallState, names: CallNamesState?, far: Transcript.Attributed?, heard: [TranscriptSegment]) async throws {
        guard let resource = await resources.resource(call: call) else { throw CancellationError() }
        let replacement = Transcript.microphoneReplacement(in: raw, far: far, names: names ?? .init(), heard: heard)
        do {
            try await resource.transcript.writer.replaceWhole(replacement.segments, speakers: replacement.speakers)
        } catch {
            resource.cleanup.sink.write(.init(category: .session, message: "bleed cleanup kept raw: replacing failed", error: String(describing: error)))
            throw error
        }
    }
}

/// Returns once each call's final transcript is delivered and the call's handles are released.
struct FinalTranscriptsPort: FinalTranscripts {
    let resources: FinalizationResources
    let deliver: @Sendable (String, FinalTranscript<Job.Entry>) async -> Void

    func publish(_ finals: [String: FinalTranscript<Job.Entry>]) async {
        for (call, transcript) in finals.sorted(by: { $0.key < $1.key }) {
            await deliver(call, transcript)
            await resources.published(call: call)
        }
    }
}
