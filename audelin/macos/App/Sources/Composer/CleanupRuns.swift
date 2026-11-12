import Foundation
import SummaryJobs

/// Owns model work until completion or quit. Only publication is joined at quit.
actor CleanupRuns {
    private struct Run {
        let work: Task<Void, Never>
        let rawHandoff: @Sendable () async -> Void
        var publication: Task<Result<Void, any Error>, Never>?
    }
    private var runs: [UUID: Run] = [:]
    private var stopped = false

    func start(raw: CallState, attributed: Transcript.Attributed?, cleanup: TranscriptCleanup, file: any SessionTranscriptFile,
               folder: URL, callbacks: SummaryCallbacks) async {
        let rawHandoff: @Sendable () async -> Void = {
            let entries = summaryEntries(raw, attributed: attributed)
            await callbacks.completed(folder, entries, true, !entries.isEmpty)
        }
        guard !stopped else { await rawHandoff(); return }
        let id = UUID()
        let work = Task {
            let entries = await cleanup.run(raw, attributed: attributed, replacing: { heard in
                try await self.publish(id: id) {
                    do {
                        try await file.replaceMicrophone(in: raw, with: heard)
                        let entries = summaryEntries(raw, heard: heard, attributed: attributed)
                        await callbacks.completed(folder, entries, true, !entries.isEmpty)
                    } catch {
                        await rawHandoff()
                        throw error
                    }
                }
            })
            try? await self.publish(id: id) {
                await callbacks.completed(folder, entries, true, !entries.isEmpty)
            }
        }
        runs[id] = Run(work: work, rawHandoff: rawHandoff)
    }

    private func publish(id: UUID, operation: @escaping @Sendable () async throws -> Void) async throws {
        guard let publication = beginPublication(id: id, operation: operation) else { throw CancellationError() }
        try await publication.value.get()
    }

    private func beginPublication(
        id: UUID, operation: @escaping @Sendable () async throws -> Void
    ) -> Task<Result<Void, any Error>, Never>? {
        guard var run = runs[id], run.publication == nil else { return nil }
        let publication = Task {
            let result: Result<Void, any Error>
            do { try await operation(); result = .success(()) }
            catch { result = .failure(error) }
            self.finished(id)
            return result
        }
        run.publication = publication
        runs[id] = run
        return publication
    }

    private func finished(_ id: UUID) { runs.removeValue(forKey: id) }

    func shutdown() async {
        stopped = true
        for (id, run) in runs {
            run.work.cancel()
            _ = beginPublication(id: id, operation: run.rawHandoff)
        }
        let publications = runs.values.compactMap(\.publication)
        for publication in publications { _ = await publication.value }
    }
}
