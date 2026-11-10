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
            return try NotesResponse.validate(output)
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

enum NotesResponse {
    /// Validate the document contract, not the truth of the generated claims.
    static func validate(_ output: String) throws -> String {
        let text = output.trimmingCharacters(in: .whitespacesAndNewlines)
        let lines = text.components(separatedBy: .newlines)
        var headings: [(offset: Int, element: String)] = []
        var fence: String?
        for (offset, line) in lines.enumerated() {
            let trimmed = line.trimmingCharacters(in: .whitespaces)
            if let marker = fence {
                if trimmed.hasPrefix(marker), trimmed.dropFirst(marker.count).allSatisfy({ $0 == marker.first || $0.isWhitespace }) {
                    fence = nil
                }
            } else if trimmed.hasPrefix("```") || trimmed.hasPrefix("~~~") {
                let character = trimmed.first!
                fence = String(trimmed.prefix(while: { $0 == character }))
            } else if line.hasPrefix("## ") {
                headings.append((offset, line))
            }
        }
        guard fence == nil else { throw SummaryRuntime.Failure.invalidResponse }
        let russian = ["О чём встреча", "Ключевые моменты", "Решения", "Задачи", "Открытые вопросы"]
        let english = ["What this was about", "Key points", "Decisions", "Actions", "Open questions"]
        let names = headings.map { String($0.element.dropFirst(3)).trimmingCharacters(in: .whitespaces) }
        guard let expected = [russian, english].first(where: { names == Array($0.prefix(4)) || names == $0 }),
              lines.first == "## " + expected[0] else { throw SummaryRuntime.Failure.invalidResponse }
        for (index, heading) in headings.enumerated() {
            let end = index + 1 < headings.count ? headings[index + 1].offset : lines.count
            let body = lines[(heading.offset + 1)..<end].joined(separator: "\n")
                .trimmingCharacters(in: .whitespacesAndNewlines)
            let refusal = ["i cannot", "i can't", "i’m sorry", "i am sorry", "не могу", "отказываюсь"]
            guard !body.isEmpty, !refusal.contains(where: { body.lowercased().hasPrefix($0) }) else { throw SummaryRuntime.Failure.invalidResponse }
        }
        return text + "\n"
    }
}
