import SummaryRuntime
import Synchronization
import Testing

@Suite struct ClaudeExecutableTests {
    @Test(arguments: ["/first:/second", "/second:/first"])
    func absolutePATHOrderWinsOverStandardLocations(path: String) throws {
        let resolver = ClaudeExecutable(path: path, home: "/home/fixture", isExecutableFile: { _ in true })
        #expect(try resolver.resolve("") == String(path.split(separator: ":")[0]) + "/claude")
    }

    @Test func ignoresEmptyRelativeAndInvalidPATHEntriesAndSkipsUnavailablePrograms() throws {
        let inspected = Mutex<[String]>([])
        let resolver = ClaudeExecutable(path: ":.:relative:~/bin:/bad\0path:/absent:/not-executable:/available/", home: "/home/fixture", isExecutableFile: { path in
            inspected.withLock { $0.append(path) }
            return path == "/available/claude"
        })
        #expect(try resolver.resolve("") == "/available/claude")
        #expect(inspected.withLock { $0 } == ["/absent/claude", "/not-executable/claude", "/available/claude"])
    }

    @Test(arguments: [0, 1, 2, 3, 4], ["", "/usr/bin:/bin:/usr/sbin:/sbin"])
    func GUIPathFallsBackToKnownInstallationsInOrder(firstAvailable: Int, path: String) throws {
        let programs = ["/home/fixture/.local/bin/claude", "/opt/homebrew/bin/claude", "/usr/local/bin/claude", "/home/fixture/.claude/local/claude", "/home/fixture/.claude/local/node_modules/.bin/claude"]
        let available = Set(programs.dropFirst(firstAvailable))
        let resolver = ClaudeExecutable(path: path, home: "/home/fixture", isExecutableFile: available.contains)
        #expect(try resolver.resolve("") == programs[firstAvailable])
    }

    @Test(arguments: ["/custom installation/claude", "/opt/homebrew/bin/claude"])
    func availableAbsoluteOverrideIsAuthoritative(program: String) throws {
        let inspected = Mutex<[String]>([])
        let resolver = ClaudeExecutable(path: "/first", home: "/home/fixture", isExecutableFile: { path in
            inspected.withLock { $0.append(path) }; return true
        })
        #expect(try resolver.resolve(program) == program)
        #expect(inspected.withLock { $0 } == [program])
    }

    @Test func missingExplicitOverrideNeverFallsBack() {
        let resolver = ClaudeExecutable(path: "/installed", home: "/home/fixture", isExecutableFile: { $0 == "/installed/claude" })
        #expect(throws: Failure.unavailable) { try resolver.resolve("/custom/claude") }
    }

    @Test(arguments: ["/from-path/claude", "/home/fixture/.local/bin/claude"])
    func unavailableLegacyDefaultRecoversThroughDiscovery(program: String) throws {
        let resolver = ClaudeExecutable(path: "/from-path", home: "/home/fixture", isExecutableFile: { $0 == program })
        #expect(try resolver.resolve("/opt/homebrew/bin/claude") == program)
    }

    @Test(arguments: ["", "/opt/homebrew/bin/claude", "/explicit/claude"])
    func absentProgramsAreUnavailable(override: String) {
        let resolver = ClaudeExecutable(path: "/usr/bin:/bin", home: "/home/fixture", isExecutableFile: { _ in false })
        #expect(throws: Failure.unavailable) { try resolver.resolve(override) }
    }

    @Test(arguments: ["claude", "./claude", "~/bin/claude", "/bad\0program"])
    func invalidOverridesFailWithoutInspectingFiles(override: String) {
        let resolver = ClaudeExecutable(path: "/installed", home: "/home/fixture", isExecutableFile: { _ in
            Issue.record("invalid overrides must not inspect files"); return true
        })
        #expect(throws: Failure.configuration) { try resolver.resolve(override) }
    }
}
