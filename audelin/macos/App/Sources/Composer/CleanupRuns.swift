import CleanupPublication
import Foundation
import SummaryJobs

/// Owns model tasks; the publication machine decides which handoff executes.
@MainActor final class CleanupRuns: CleanupPublications {
    private final class Run {
        var work: Task<Void, Never>?
        let rawHandoff: @Sendable () async -> Void
        var operation: (@Sendable () async throws -> Void)?
        var result: Result<Void, any Error>?
        init(rawHandoff: @escaping @Sendable () async -> Void) { self.rawHandoff = rawHandoff }
    }
    private var runs: [UUID: Run] = [:]
    private lazy var model = CleanupPublicationModel(publications: CleanupRunPublications(owner: self))
    nonisolated init() {}

    func start(raw: CallState, cleanup: TranscriptCleanup, file: any SessionTranscriptFile,
               folder: URL, callbacks: SummaryCallbacks) async {
        let rawHandoff: @Sendable () async -> Void = {
            let entries = summaryEntries(Transcript.segments(from: raw))
            await callbacks.completed(folder, entries, true, !entries.isEmpty)
        }
        let id = UUID(), run = Run(rawHandoff: rawHandoff)
        runs[id] = run
        run.work = Task {
            await cleanup.run(raw, replacing: { heard in
                try await self.publishReplacement(id: id) {
                    try await file.replaceMicrophone(in: raw, with: heard)
                    let entries = summaryEntries(Transcript.replacingMicrophone(in: raw, with: heard))
                    await callbacks.completed(folder, entries, true, !entries.isEmpty)
                }
            })
            self.model.send(.completed(id, .raw))
        }
        model.send(.started(id))
    }

    private func publishReplacement(id: UUID,
                                    operation: @escaping @Sendable () async throws -> Void) async throws {
        guard let run = runs[id] else { throw CancellationError() }
        run.operation = operation
        let accepted = model.complete(id, as: .cleaned)
        // Joining publication must survive cancellation of the model work that requested it.
        let completion = Task { await model.wait(id) }
        await completion.value
        guard accepted, let result = run.result else { throw CancellationError() }
        try result.get()
    }

    func cancel(_ id: UUID) { runs[id]?.work?.cancel() }

    func publish(_ id: UUID, as publication: Publication) async {
        guard let run = runs[id] else { return }
        do {
            switch publication {
            case .cleaned:
                guard let operation = run.operation else { preconditionFailure("Cleaned publication requires a replacement") }
                try await operation()
            case .raw: await run.rawHandoff()
            }
            run.result = .success(())
        } catch {
            await run.rawHandoff()
            run.result = .failure(error)
        }
        runs[id] = nil
    }

    func shutdown() async { await model.shutdown() }
}

@MainActor private struct CleanupRunPublications: CleanupPublications {
    weak var owner: CleanupRuns?
    func cancel(_ id: UUID) { owner?.cancel(id) }
    func publish(_ id: UUID, as publication: Publication) async { await owner?.publish(id, as: publication) }
}
