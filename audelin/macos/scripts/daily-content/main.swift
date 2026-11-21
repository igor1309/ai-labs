// Runs the shipped Daily template through the app's own notes path (NotesGeneration.Generator
// over SummaryRuntime's Claude CLI attempt, same arguments, 120 s deadline and 4 MiB limit as
// Compose.swift) on exported call transcripts, and writes the validated notes next to each input.
// Usage: daily-content <model> <transcript.md>...   Writes <transcript>.daily.<model>.md.
import Foundation
import NotesGeneration
import SummaryRuntime
@testable import TemplateFiles

/// The app sends one "[time] label: text" line per entry; exports use "**label** time" blocks.
func entries(_ export: String) -> [Line] {
    var lines: [Line] = [], header: (String, String)?, body: [String] = []
    func flush() { if let (label, time) = header, !body.isEmpty { lines.append(Line(time: time, label: label, text: body.joined(separator: " "), isUser: label == "Me")) }; body = [] }
    for raw in export.components(separatedBy: .newlines) {
        let line = raw.trimmingCharacters(in: .whitespaces)
        if line.hasPrefix("**"), let close = line.range(of: "** ", range: line.index(line.startIndex, offsetBy: 2)..<line.endIndex) {
            flush(); header = (String(line[line.index(line.startIndex, offsetBy: 2)..<close.lowerBound]), String(line[close.upperBound...]))
        } else if header != nil, !line.isEmpty { body.append(line) }
    }
    flush()
    return lines
}

struct Attempt: TextAttempt {
    let runtime: Runtime, configuration: Configuration
    func generate(_ request: String) async throws -> String { try await runtime.generate(configuration, prompt: request) }
}

@main struct DailyContent {
    static func main() async throws {
        let arguments = Array(CommandLine.arguments.dropFirst())
        guard arguments.count >= 2 else { FileHandle.standardError.write(Data("Usage: daily-content <model> <transcript.md>...\n".utf8)); exit(2) }
        let daily = Files.shippedDaily
        let template = NotesGeneration.Template(name: daily.name, instructions: daily.instructions,
            headings: daily.headings.map { $0.map { NotesGeneration.Template.Heading($0.name, required: $0.required) } })
        let clock = ContinuousClock(), start = clock.now
        let now: @Sendable () -> Double = { let d = clock.now - start; return Double(d.components.seconds) + Double(d.components.attoseconds) / 1e18 }
        let runtime = Runtime(process: ProcessRunner(now: now, deadline: 120, outputLimit: 4 * 1024 * 1024, observe: { _ in }),
            http: HTTPClient(limit: 4 * 1024 * 1024, sleep: { try await Task.sleep(for: .seconds(120)) }),
            credential: { _ in nil },
            resolveProgram: ClaudeExecutable(path: ProcessInfo.processInfo.environment["PATH"] ?? "", home: NSHomeDirectory(),
                                             isExecutableFile: { FileManager.default.isExecutableFile(atPath: $0) }).resolve,
            deadline: { try await Task.sleep(for: .seconds(120)) })
        let generator = Generator(text: Attempt(runtime: runtime, configuration: .init(kind: .claudeCLI, model: arguments[0], program: "", endpoint: "", credentialVariable: "")))
        var failed = false
        for path in arguments.dropFirst() {
            let transcript = entries(try String(contentsOfFile: path, encoding: .utf8))
            let output = URL(fileURLWithPath: path).deletingPathExtension().path + ".daily.\(arguments[0]).md"
            do {
                let notes = try await generator.notes(lines: transcript, userName: nil, evidence: "", template: template)
                try notes.write(toFile: output, atomically: true, encoding: .utf8)
                print("OK \(path) -> \(output)")
            } catch { failed = true; print("FAIL \(path): \(error)") }
        }
        exit(failed ? 1 : 0)
    }
}
