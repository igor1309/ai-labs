import Foundation
import Synchronization
import SpeakerIdentification
import SummaryJobs
import SummaryRuntime
import NotesGeneration

struct SummaryGeneration: SummariesGeneration {
    let runtime: SummaryRuntime.Runtime
    let sink: any LogSink
    private let running = RunningCalls()
    func identify(_ job: Job) async throws -> [SummaryJobs.Identity] {
        try await running.run(job.id) { try await fallback(job) { configuration in
            let output = try await runtime.generate(configuration, prompt: Prompts.speakers + "\nTRANSCRIPT DATA:\n" + transcript(job))
            let entries = job.entries.map { SpeakerIdentification.Entry(label: $0.label, time: $0.time, text: $0.text) }
            return try SpeakerIdentification.Validator().validate(Data(output.utf8), entries: entries).map {
                SummaryJobs.Identity(label: $0.label, name: $0.name, time: $0.time, quote: $0.quote)
            }
        } }
    }
    func notes(_ job: Job, identities: [SummaryJobs.Identity], template: SummaryJobs.Template) async throws -> String {
        try await running.run(job.id) { try await fallback(job) { configuration in
            let mapping = identities.map { "\($0.label): \($0.name) (\($0.time): \($0.quote))" }.joined(separator: "\n")
            let generator = NotesGeneration.Generator(text: RuntimeTextAttempt(runtime: runtime, configuration: configuration))
            return try await generator.notes(transcript: transcript(job), evidence: mapping, template: notesTemplate(template))
        } }
    }
    /// Stops the job's running call and returns once it has ended; the call then throws a cancellation.
    func cancel(_ job: Job) async { await running.cancel(job.id) }
    private func fallback<Value: Sendable>(_ job: Job, attempt: (SummaryRuntime.Configuration) async throws -> Value) async throws -> Value {
        do { return try await attempt(runtimeConfiguration(job.primary)) }
        catch {
            if Task.isCancelled || error is CancellationError || error as? SummaryRuntime.Failure == .cancelled { throw CancellationError() }
            guard let fallback = job.fallback else { throw error }
            // Diagnostics can contain transcript or credentials; only a fixed classification is logged.
            sink.write(.init(category: .session, message: "summary primary attempt failed; trying fallback"))
            return try await attempt(runtimeConfiguration(fallback))
        }
    }
    private func transcript(_ job: Job) -> String {
        job.entries.map { "[\($0.time)] \($0.label): \($0.text)" }.joined(separator: "\n")
    }
}

/// The generation calls running now, by job, so a cancel can stop one.
private final class RunningCalls: Sendable {
    private let cancels = Mutex<[String: @Sendable () async -> Void]>([:])
    func run<Value: Sendable>(_ id: String, _ work: @escaping @Sendable () async throws -> Value) async throws -> Value {
        let task = Task { try await work() }
        cancels.withLock { $0[id] = { task.cancel(); _ = await task.result } }
        defer { cancels.withLock { _ = $0.removeValue(forKey: id) } }
        return try await withTaskCancellationHandler { try await task.value } onCancel: { task.cancel() }
    }
    func cancel(_ id: String) async { await cancels.withLock { $0[id] }?() }
}

struct RuntimeTextAttempt: NotesGeneration.TextAttempt {
    let runtime: SummaryRuntime.Runtime
    let configuration: SummaryRuntime.Configuration
    func generate(_ request: String) async throws -> String { try await runtime.generate(configuration, prompt: request) }
}
func notesTemplate(_ template: SummaryJobs.Template) -> NotesGeneration.Template {
    .init(name: template.name, instructions: template.instructions,
          headings: template.headings.map { $0.map { .init($0.name, required: $0.required) } })
}
