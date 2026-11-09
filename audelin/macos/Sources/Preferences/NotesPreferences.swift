public struct NotesPreferences: Codable, Equatable, Sendable {
    public struct Runtime: Codable, Equatable, Sendable {
        public var kind: String
        public var model: String
        public var executable: String
        public var endpoint: String
        public var credentialVariable: String
        public init(kind: String, model: String, executable: String, endpoint: String, credentialVariable: String) {
            self.kind = kind; self.model = model; self.executable = executable
            self.endpoint = endpoint; self.credentialVariable = credentialVariable
        }
    }
    public var enabled: Bool
    public var speakers: Bool
    public var primary: Runtime
    public var fallback: Runtime?
    public init(enabled: Bool = false, speakers: Bool = false,
                primary: Runtime = .init(kind: "claudeCLI", model: "sonnet", executable: "", endpoint: "", credentialVariable: ""),
                fallback: Runtime? = nil) {
        self.enabled = enabled; self.speakers = speakers; self.primary = primary; self.fallback = fallback
    }
}
