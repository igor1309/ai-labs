/// Resolves Claude without starting a shell, including installs outside a GUI app's PATH.
public struct ClaudeExecutable: Sendable {
    private let path: String
    private let home: String
    private let isExecutableFile: @Sendable (String) -> Bool

    /// `isExecutableFile` accepts executable files (including symlinks), never directories.
    public init(path: String, home: String, isExecutableFile: @escaping @Sendable (String) -> Bool) {
        self.path = path; self.home = home; self.isExecutableFile = isExecutableFile
    }

    public func resolve(_ override: String) throws -> String {
        guard override.isEmpty || override.hasPrefix("/") && !override.contains("\0") else { throw Failure.configuration }
        if !override.isEmpty {
            if isExecutableFile(override) { return override }
            // Older preferences saved this default even when Claude was installed elsewhere.
            if override != "/opt/homebrew/bin/claude" { throw Failure.unavailable }
        }
        let directories = path.split(separator: ":", omittingEmptySubsequences: false).map(String.init)
            + [home + "/.local/bin", "/opt/homebrew/bin", "/usr/local/bin", home + "/.claude/local", home + "/.claude/local/node_modules/.bin"]
        var seen = Set<String>()
        for directory in directories where directory.hasPrefix("/") && !directory.contains("\0") {
            let program = (directory.hasSuffix("/") ? directory : directory + "/") + "claude"
            if seen.insert(program).inserted && isExecutableFile(program) { return program }
        }
        throw Failure.unavailable
    }
}
