import Foundation
import SummaryRuntime
import Synchronization
import Testing

@Suite struct SummaryRuntimeTests {
    @Test func syntaxValidationIsIndependentOfProviderAvailability() {
        var config = cli()
        config.program = ""
        #expect(Runtime.configurationIssues(config).isEmpty)
        config.program = "/missing/cli"
        #expect(Runtime.configurationIssues(config).isEmpty)
        config.model = " \n"
        config.program = "relative"
        config.endpoint = "https://user:secret@example.com/v1"
        config.credentialVariable = "secret=value"
        #expect(Runtime.configurationIssues(config) == [.init(field: .model), .init(field: .program), .init(field: .endpoint, hidesValue: true), .init(field: .credentialVariable, hidesValue: true)])
    }
    @Test(arguments: ["https://example.com/v1", "http://localhost/v1", "http://127.0.0.2/v1", "http://[::1]/v1"])
    func syntaxAcceptsSafeEndpointsWithoutCredentials(endpoint: String) {
        #expect(Runtime.configurationIssues(api(endpoint: endpoint)).isEmpty)
    }
    @Test func CLIProbesBeforeLiteralInputAndUsesRequiredControls() async throws {
        let process = ProcessSpy(help: help)
        let prompt = String(repeating: "literal $(touch /no) `whoami` ; ' \n", count: 10000)
        #expect(try await makeRuntime(process: process).generate(cli(), prompt: prompt) == "complete")
        let calls = await process.calls
        #expect(calls.count == 2)
        #expect(calls.map(\.program) == ["/fixture/claude", "/fixture/claude"])
        #expect(calls[0].arguments == ["--help"])
        #expect(calls[0].input.isEmpty)
        #expect(calls[1].input == Data(prompt.utf8))
        #expect(calls[1].arguments == ["-p", "--safe-mode", "--restricted", "--tools", "", "--strict-mcp-config", "--mcp-config", #"{"mcpServers":{}}"#, "--no-session-persistence", "--output-format", "json", "--model", "editable-model", "--max-output-tokens", "4096"])
    }
    @Test(arguments: ["", "/opt/homebrew/bin/claude", "/chosen/claude"])
    func validationAndGenerationResolveBeforeProbingAndPinTheProgram(override: String) async throws {
        let installed = Mutex("/chosen/claude")
        let resolutions = Mutex<[String]>([])
        let resolver = ClaudeExecutable(path: "/chosen:/replacement", home: "/home/fixture", isExecutableFile: { path in
            installed.withLock { $0 == path }
        })
        let process = ProcessSpy(help: help, onProbe: { installed.withLock { $0 = "/replacement/claude" } })
        let runtime = makeRuntime(process: process, resolveProgram: { value in
            resolutions.withLock { $0.append(value) }; return try resolver.resolve(value)
        })
        var config = cli(); config.program = override
        try await runtime.validate(config)
        installed.withLock { $0 = "/chosen/claude" }
        #expect(try await runtime.generate(config, prompt: "private input") == "complete")
        #expect(resolutions.withLock { $0 } == [override, override])
        let calls = await process.calls
        #expect(calls.map(\.program) == Array(repeating: "/chosen/claude", count: 3))
        #expect(calls.map(\.input) == [Data(), Data(), Data("private input".utf8)])
        #expect(calls.prefix(2).allSatisfy { $0.arguments == ["--help"] })
    }
    @Test(arguments: ["", "/opt/homebrew/bin/claude", "/missing/claude"])
    func unavailableProgramsFailValidationAndGenerationWithoutLaunching(override: String) async {
        let process = ProcessSpy(help: help)
        let resolver = ClaudeExecutable(path: "/usr/bin:/bin", home: "/home/fixture", isExecutableFile: { _ in false })
        let runtime = makeRuntime(process: process, resolveProgram: resolver.resolve)
        var config = cli(); config.program = override
        await #expect(throws: Failure.unavailable) { try await runtime.validate(config) }
        await #expect(throws: Failure.unavailable) { try await runtime.generate(config, prompt: "private input") }
        #expect(await process.calls.isEmpty)
    }
    @Test(arguments: Runtime.controls + ["-p"], ["", "/opt/homebrew/bin/claude", "/fixture/claude"])
    func unsupportedControlNeverReceivesTranscript(missing: String, override: String) async {
        let process = ProcessSpy(help: help.replacingOccurrences(of: missing + " ", with: ""))
        let resolver = ClaudeExecutable(path: "/fixture", home: "/home/fixture", isExecutableFile: { _ in true })
        var config = cli(); config.program = override
        await #expect(throws: Failure.unavailable) {
            try await makeRuntime(process: process, resolveProgram: resolver.resolve).generate(config, prompt: "private input")
        }
        #expect(await process.calls.count == 1)
        #expect(await process.calls.first?.program == (override.isEmpty ? "/fixture/claude" : override))
        #expect(await process.calls.first?.input.isEmpty == true)
    }
    @Test func APIUsesExplicitCapAndOptionalLoopbackCredential() async throws {
        let http = HTTPSpy()
        let runtime = makeRuntime(http: http, resolveProgram: { _ in
            Issue.record("API must not resolve a CLI"); throw Failure.unavailable
        })
        try await runtime.validate(api())
        #expect(try await runtime.generate(api(), prompt: "synthetic API content") == "complete")
        let call = try #require(await http.calls.first)
        #expect(call.url.absoluteString == "http://127.0.0.1:8080/v1/chat/completions")
        #expect(call.loopback)
        #expect(call.headers["Authorization"] == nil)
        let body = try #require(try JSONSerialization.jsonObject(with: call.body) as? [String: Any])
        #expect(body["model"] as? String == "editable-model")
        #expect(body["stream"] as? Bool == false)
        #expect(body["max_tokens"] as? Int == 4096)
        #expect((body["messages"] as? [[String: String]]) == [["role": "user", "content": "synthetic API content"]])
    }
    @Test(arguments: ["http://example.com/v1", "https://u:p@example.com", "https://example.com?q=secret", "https://example.com/#fragment", "file:///tmp/x"])
    func rejectsUnsafeEndpointBeforeNetwork(endpoint: String) async {
        let http = HTTPSpy()
        #expect(Runtime.configurationIssues(api(endpoint: endpoint)).map(\.field) == [.endpoint])
        await #expect(throws: Failure.configuration) { try await makeRuntime(http: http).generate(api(endpoint: endpoint), prompt: "input") }
        #expect(await http.calls.isEmpty)
    }
    @Test func missingNativeCredentialFailsValidationWithoutRequest() async {
        let http = HTTPSpy()
        var config = api(); config.credentialVariable = "MISSING_FIXTURE_CREDENTIAL"
        await #expect(throws: Failure.authentication) { try await makeRuntime(http: http).validate(config) }
        #expect(await http.calls.isEmpty)
    }
    @Test(arguments: [401, 403, 429, 302, 500])
    func hostedFailuresAreClassifiedWithoutDiagnostics(status: Int) {
        let expected: Failure = status == 429 ? .quota : status == 401 || status == 403 ? .authentication : .transport
        #expect(throws: expected) { try Runtime.api(.init(status: status, body: Data("secret diagnostic".utf8))) }
    }
    @Test(arguments: ["{}", "", #"{"choices":[{"finish_reason":"length","message":{"content":"partial"}}]}"#, #"{"choices":[{"finish_reason":"stop","message":{"refusal":"no","content":"no"}}]}"#, #"{"error":{"message":"private diagnostic"}}"#])
    func malformedEmptyTruncatedAndRefusedAPIResponsesFail(json: String) {
        #expect(throws: Failure.invalidResponse) { try Runtime.api(.init(status: 200, body: Data(json.utf8))) }
    }
    @Test(arguments: [
        (#"{"type":"result","subtype":"success","is_error":true,"result":"quota exceeded"}"#, Failure.quota),
        (#"{"type":"result","subtype":"error","error":"authentication required"}"#, Failure.authentication),
        (#"{"type":"result","subtype":"success","result":"partial","stop_reason":"max_tokens"}"#, Failure.invalidResponse),
        (#"{"type":"result","subtype":"success","result":""}"#, Failure.invalidResponse),
        (#"{"type":"result","subtype":"success","result":"You've hit your limit"}"#, Failure.quota),
        ("not json", Failure.transport)
    ])
    func CLIErrorEnvelopesNeverSucceed(json: String, failure: Failure) {
        #expect(throws: failure) { try Runtime.cli(.init(status: 0, stdout: Data(json.utf8), stderr: Data("never disclose".utf8))) }
    }
    @Test func nonzeroExitNeverReturnsResult() {
        #expect(throws: Failure.transport) { try Runtime.cli(.init(status: 7, stdout: Data(success.utf8), stderr: Data("private".utf8))) }
    }
    @Test(arguments: ["quota exceeded", "usage limit reached", "you've hit your limit", "rate limit exceeded"])
    func successfulNotesCanDiscussQuotaFailures(phrase: String) throws {
        let notes = "{\"keyPoints\":[\"Discussed " + phrase + " errors\"]}"
        let data = try JSONSerialization.data(withJSONObject: ["type": "result", "subtype": "success", "is_error": false, "result": notes])
        #expect(try Runtime.cli(.init(status: 0, stdout: data, stderr: Data())) == notes)
    }
    @Test func endToEndDeadlineCancelsAndJoinsActiveAttempt() async throws {
        let timer = Gate(), request = Gate()
        let runtime = Runtime(process: ProcessSpy(help: help), http: HeldHTTP(gate: request), credential: { _ in nil }, resolveProgram: { $0 }, deadline: { try await timer.wait() })
        let task = Task { try await runtime.generate(api(), prompt: "input") }
        await timer.started(); await request.started()
        timer.release()
        await #expect(throws: Failure.timeout) { try await task.value }
        #expect(request.cancelled.withLock { $0 })
    }
    @Test func cancellationClosesActiveAttempt() async {
        let timer = Gate(), request = Gate()
        let runtime = Runtime(process: ProcessSpy(help: help), http: HeldHTTP(gate: request), credential: { _ in nil }, resolveProgram: { $0 }, deadline: { try await timer.wait() })
        let task = Task { try await runtime.generate(api(), prompt: "input") }
        await timer.started(); await request.started()
        task.cancel()
        await #expect(throws: (any Error).self) { try await task.value }
        #expect(request.cancelled.withLock { $0 })
    }
}
private let help = "-p " + Runtime.controls.joined(separator: " ") + " --max-output-tokens "
private let success = #"{"type":"result","subtype":"success","is_error":false,"result":"complete"}"#
private func cli() -> Configuration { .init(kind: .claudeCLI, model: "editable-model", program: "/fixture/claude", endpoint: "", credentialVariable: "") }
private func api(endpoint: String = "http://127.0.0.1:8080/v1") -> Configuration { .init(kind: .compatibleAPI, model: "editable-model", program: "", endpoint: endpoint, credentialVariable: "") }
private func makeRuntime(process: any ProcessRunning = ProcessSpy(help: help), http: any HTTPRequesting = HTTPSpy(),
                         resolveProgram: @escaping @Sendable (String) throws -> String = { $0 }) -> Runtime {
    Runtime(process: process, http: http, credential: { _ in nil }, resolveProgram: resolveProgram, deadline: { try await Gate().wait() })
}
private actor ProcessSpy: ProcessRunning {
    struct Call: Sendable { var program: String; var arguments: [String]; var input: Data }
    var calls: [Call] = []
    let help: String
    let onProbe: @Sendable () -> Void
    init(help: String, onProbe: @escaping @Sendable () -> Void = {}) { self.help = help; self.onProbe = onProbe }
    func run(program: String, arguments: [String], input: Data) -> ProcessOutput {
        calls.append(.init(program: program, arguments: arguments, input: input))
        if arguments == ["--help"] { onProbe() }
        return .init(status: 0, stdout: Data((arguments == ["--help"] ? help : success).utf8), stderr: Data())
    }
}
private actor HTTPSpy: HTTPRequesting {
    struct Call: Sendable { var url: URL; var headers: [String: String]; var body: Data; var loopback: Bool }
    var calls: [Call] = []
    func request(url: URL, headers: [String: String], body: Data, loopback: Bool) -> HTTPResponse {
        calls.append(.init(url: url, headers: headers, body: body, loopback: loopback))
        return .init(status: 200, body: Data(#"{"choices":[{"finish_reason":"stop","message":{"content":"complete","refusal":null}}]}"#.utf8))
    }
}
private struct HeldHTTP: HTTPRequesting {
    let gate: Gate
    func request(url: URL, headers: [String: String], body: Data, loopback: Bool) async throws -> HTTPResponse { try await gate.wait(); throw Failure.transport }
}
private final class Gate: Sendable {
    struct State { var continuation: CheckedContinuation<Void, any Error>?; var cancelled = false }
    let cancelled = Mutex(false)
    private let state = Mutex(State())
    private let signal = AsyncStream<Void>.makeStream()
    func started() async { for await _ in signal.stream { return } }
    func wait() async throws {
        try await withTaskCancellationHandler {
            try await withCheckedThrowingContinuation { (continuation: CheckedContinuation<Void, any Error>) in
                state.withLock { state in
                    if state.cancelled { continuation.resume(throwing: CancellationError()) }
                    else { state.continuation = continuation }
                }
                signal.continuation.yield(())
            }
        } onCancel: {
            self.cancelled.withLock { $0 = true }
            self.state.withLock { state in state.cancelled = true; state.continuation?.resume(throwing: CancellationError()); state.continuation = nil }
        }
    }
    func release() { state.withLock { $0.continuation?.resume(); $0.continuation = nil } }
}
