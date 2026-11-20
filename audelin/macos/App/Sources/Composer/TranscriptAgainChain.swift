import Foundation
import ReRecognition
import Recordings
import Synchronization

/// Owns only the task handles needed to stop the requested run, including while a port settles.
final class TranscriptAgainChain: RecordingsTranscriptAgain, Sendable {
    private struct Key: Hashable { let id: String; let request: Int }
    private let tasks = Mutex<[Key: Task<Void, Never>]>([:])
    private let originals: @Sendable (String) async throws -> [ReRecognition.OriginalCall]
    private let recognition: ReRecognition
    private let build: ReRecognition.Build
    private let describe: @Sendable (any Error) -> String

    init(originals: @escaping @Sendable (String) async throws -> [ReRecognition.OriginalCall],
         recognition: ReRecognition, build: ReRecognition.Build, describe: @escaping @Sendable (any Error) -> String) {
        self.originals = originals; self.recognition = recognition; self.build = build; self.describe = describe
    }

    /// Registers the run's task before returning its reports, so `stop` called after this finds it.
    func run(id: String, request: Int) -> AsyncStream<TranscriptReport> {
        let key = Key(id: id, request: request)
        let (reports, output) = AsyncStream.makeStream(of: TranscriptReport.self)
        output.onTermination = { [weak self] _ in self?.tasks.withLock { $0[key]?.cancel() } }
        tasks.withLock { tasks in
            tasks[key] = Task {
                defer {
                    self.tasks.withLock { $0[key] = nil }
                    output.finish()
                }
                do {
                    let parts = try await originals(id)
                    let result = await recognition.run(call: id, originals: parts, build: build) { wait in
                        let wait: TranscriptWait = switch wait {
                        case .preparing: .preparing
                        case let .hearing(fraction): .hearing(fraction)
                        case .finishing: .finishing
                        }
                        output.yield(.waiting(wait))
                    }
                    switch result {
                    case .made: output.yield(.made)
                    case .stopped: output.yield(.stopped)
                    case let .failed(original, reason):
                        output.yield(.failed(original.map { "«\($0)»: \(reason)" } ?? reason))
                    }
                } catch {
                    output.yield(Task.isCancelled ? .stopped : .failed(describe(error)))
                }
            }
        }
        return reports
    }

    func stop(id: String, request: Int) async {
        let task = tasks.withLock { $0[Key(id: id, request: request)] }
        task?.cancel()
        await task?.value
    }
}
