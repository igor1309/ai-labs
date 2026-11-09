import Foundation
import SpeakerIdentification
import SummaryJobs
import SummaryRuntime

struct SummaryGeneration: SummaryJobs.Generation {
    let runtime: SummaryRuntime.Runtime
    let sink: any LogSink
    func identify(_ job: Job) async throws -> [SummaryJobs.Identity] {
        try await fallback(job) { configuration in
            let output = try await runtime.generate(configuration, prompt: Prompts.speakers + "\nTRANSCRIPT DATA:\n" + transcript(job))
            let entries = job.entries.map { SpeakerIdentification.Entry(label: $0.label, time: $0.time, text: $0.text) }
            return try SpeakerIdentification.Validator().validate(Data(output.utf8), entries: entries).map {
                SummaryJobs.Identity(label: $0.label, name: $0.name, time: $0.time, quote: $0.quote)
            }
        }
    }
    func notes(_ job: Job, identities: [SummaryJobs.Identity]) async throws -> String {
        try await fallback(job) { configuration in
            let mapping = identities.map { "\($0.label): \($0.name) (\($0.time): \($0.quote))" }.joined(separator: "\n")
            let prompt = Prompts.notes + "\nACCEPTED EVIDENCE:\n" + mapping + "\nTRANSCRIPT DATA:\n" + transcript(job)
            let output = try await runtime.generate(configuration, prompt: prompt)
            return try NotesResponse.render(Data(output.utf8))
        }
    }
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

struct NotesResponse: Decodable {
    var language: String
    var topic: String
    var keyPoints: [String]
    var decisions: [String]
    var actions: [String]
    var openQuestions: [String]?
    static func render(_ data: Data) throws -> String {
        let response = try JSONDecoder().decode(Self.self, from: data)
        let all = [response.topic] + response.keyPoints + response.decisions + response.actions + (response.openQuestions ?? [])
        guard ["ru", "en"].contains(response.language), !response.keyPoints.isEmpty,
              all.allSatisfy({ !$0.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty }),
              !["i cannot", "i can't", "i’m sorry", "i am sorry", "не могу", "отказываюсь"].contains(where: { response.topic.lowercased().hasPrefix($0) }) else { throw SummaryRuntime.Failure.invalidResponse }
        let ru = response.language == "ru"
        func section(_ heading: String, _ values: [String], none: Bool = false) -> String {
            let body = values.isEmpty && none ? (ru ? "Не зафиксировано." : "None recorded.") : values.map { "- " + $0 }.joined(separator: "\n")
            return "## " + heading + "\n\n" + body + "\n\n"
        }
        var text = "# " + (ru ? "Тема" : "Topic") + "\n\n" + response.topic + "\n\n"
        text += section(ru ? "Ключевые моменты" : "Key points", response.keyPoints)
        text += section(ru ? "Решения" : "Decisions", response.decisions, none: true)
        text += section(ru ? "Действия" : "Actions", response.actions, none: true)
        if let questions = response.openQuestions, !questions.isEmpty { text += section(ru ? "Открытые вопросы" : "Open questions", questions) }
        return text
    }
}
