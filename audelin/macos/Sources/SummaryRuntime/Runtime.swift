import Foundation

public enum Failure: String, Error, Codable, Sendable {
    case unavailable, authentication, quota, transport, invalidResponse, outputLimit, timeout, cancelled, configuration
}
public struct Configuration: Sendable, Equatable {
    public enum Kind: String, Sendable { case claudeCLI, compatibleAPI }
    public var kind: Kind
    public var model: String
    public var program: String
    public var endpoint: String
    public var credentialVariable: String
    public init(kind: Kind, model: String, program: String, endpoint: String, credentialVariable: String) {
        self.kind = kind; self.model = model; self.program = program; self.endpoint = endpoint; self.credentialVariable = credentialVariable
    }
}
public struct Runtime: Sendable {
    private let process: any ProcessRunning
    private let http: any HTTPRequesting
    private let credential: @Sendable (String) -> String?
    public init(process: any ProcessRunning, http: any HTTPRequesting, credential: @escaping @Sendable (String) -> String?) {
        self.process = process; self.http = http; self.credential = credential
    }
    public static let controls = ["--safe-mode", "--restricted", "--tools", "--strict-mcp-config", "--mcp-config", "--no-session-persistence", "--output-format"]
    public func validate(_ config: Configuration) async throws {
        guard !config.model.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { throw Failure.configuration }
        switch config.kind {
        case .claudeCLI:
            guard config.program.hasPrefix("/"), !config.program.contains("\0") else { throw Failure.configuration }
            let output = try await process.run(program: config.program, arguments: ["--help"], input: Data())
            let help = String(decoding: output.stdout, as: UTF8.self)
            guard output.status == 0, Self.controls.allSatisfy({ help.contains($0) }), help.contains("-p") else { throw Failure.unavailable }
        case .compatibleAPI:
            _ = try Self.endpoint(config.endpoint)
            if !config.credentialVariable.isEmpty {
                guard config.credentialVariable.range(of: "^[A-Za-z_][A-Za-z0-9_]*$", options: .regularExpression) != nil else { throw Failure.configuration }
                guard credential(config.credentialVariable)?.isEmpty == false else { throw Failure.authentication }
            }
        }
    }
    public func generate(_ config: Configuration, prompt: String) async throws -> String {
        try Task.checkCancellation()
        switch config.kind {
        case .claudeCLI:
            // Probe without input before any transcript is handed to the program.
            let help = try await process.run(program: config.program, arguments: ["--help"], input: Data())
            let text = String(decoding: help.stdout, as: UTF8.self)
            guard help.status == 0, Self.controls.allSatisfy({ text.contains($0) }), text.contains("-p") else { throw Failure.unavailable }
            var arguments = ["-p", "--safe-mode", "--restricted", "--tools", "", "--strict-mcp-config", "--mcp-config", "{\"mcpServers\":{}}", "--no-session-persistence", "--output-format", "json", "--model", config.model]
            if text.contains("--max-output-tokens") { arguments += ["--max-output-tokens", "4096"] }
            let output = try await process.run(program: config.program, arguments: arguments, input: Data(prompt.utf8))
            return try Self.cli(output)
        case .compatibleAPI:
            let url = try Self.endpoint(config.endpoint).appendingPathComponent("chat/completions")
            var headers = ["Content-Type": "application/json"]
            if !config.credentialVariable.isEmpty {
                guard config.credentialVariable.range(of: "^[A-Za-z_][A-Za-z0-9_]*$", options: .regularExpression) != nil else { throw Failure.configuration }
                guard let token = credential(config.credentialVariable), !token.isEmpty else { throw Failure.authentication }
                headers["Authorization"] = "Bearer " + token
            }
            let body = try JSONSerialization.data(withJSONObject: ["model": config.model, "stream": false, "max_tokens": 4096,
                "messages": [["role": "user", "content": prompt]]])
            let response = try await http.request(url: url, headers: headers, body: body, loopback: Self.isLoopback(url.host))
            return try Self.api(response)
        }
    }
    public static func isLoopback(_ host: String?) -> Bool {
        guard let host else { return false }
        return host == "localhost" || host == "::1" || host == "[::1]" || host.split(separator: ".").count == 4 && host.hasPrefix("127.") && host.split(separator: ".").allSatisfy { UInt8($0) != nil }
    }
    public static func endpoint(_ string: String) throws -> URL {
        guard let parts = URLComponents(string: string), let url = parts.url, parts.host != nil,
              parts.user == nil, parts.password == nil, parts.query == nil, parts.fragment == nil,
              parts.scheme == "https" || parts.scheme == "http" && isLoopback(parts.host) else { throw Failure.configuration }
        return url
    }
    public static func cli(_ output: ProcessOutput) throws -> String {
        let object = (try? JSONSerialization.jsonObject(with: output.stdout)) as? [String: Any]
        let failureText = String(decoding: output.stdout, as: UTF8.self).lowercased()
        if output.status != 0 || object?["is_error"] as? Bool == true || object?["error"] != nil || object?["subtype"] as? String != "success" {
            if failureText.contains("quota") || failureText.contains("rate_limit") || failureText.contains("usage limit") { throw Failure.quota }
            if failureText.contains("auth") || failureText.contains("login") { throw Failure.authentication }
            throw Failure.transport
        }
        guard object?["type"] as? String == "result", let result = object?["result"] as? String,
              !result.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty,
              object?["stop_reason"] as? String != "max_tokens", object?["finish_reason"] as? String != "length",
              !result.lowercased().contains("usage limit reached") else { throw Failure.invalidResponse }
        return result
    }
    public static func api(_ response: HTTPResponse) throws -> String {
        if response.status == 401 || response.status == 403 { throw Failure.authentication }
        if response.status == 429 { throw Failure.quota }
        guard (200..<300).contains(response.status) else { throw Failure.transport }
        guard let object = try JSONSerialization.jsonObject(with: response.body) as? [String: Any], object["error"] == nil,
              let choices = object["choices"] as? [[String: Any]], choices.count == 1,
              let choice = choices.first, choice["finish_reason"] as? String == "stop",
              let message = choice["message"] as? [String: Any], message["refusal"] == nil || message["refusal"] is NSNull,
              let content = message["content"] as? String, !content.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { throw Failure.invalidResponse }
        return content
    }
}
public struct ProcessOutput: Sendable {
    public var status: Int32
    public var stdout: Data
    public var stderr: Data
    public init(status: Int32, stdout: Data, stderr: Data) { self.status = status; self.stdout = stdout; self.stderr = stderr }
}
public protocol ProcessRunning: Sendable {
    func run(program: String, arguments: [String], input: Data) async throws -> ProcessOutput
}
public struct HTTPResponse: Sendable {
    public var status: Int
    public var body: Data
    public init(status: Int, body: Data) { self.status = status; self.body = body }
}
public protocol HTTPRequesting: Sendable {
    func request(url: URL, headers: [String: String], body: Data, loopback: Bool) async throws -> HTTPResponse
}
