import BlockingTestWork
import Foundation
import Testing

struct ClosureLockScannerTests {
    @Test(arguments: [
        "let receive: Mutex<(Int) -> Void>",
        "var receive: OSAllocatedUnfairLock<@Sendable () -> Void>",
        "struct Capture { let receive: Mutex<(@Sendable (Int) -> Void)?> }",
        "func start() { let receive: Mutex<(() -> Void)?> = makeLock() }",
        "func start() { var receive: OSAllocatedUnfairLock<Optional<() -> Void>> = makeLock() }",
        "let receive = Mutex<(@Sendable (Int32) -> Void)?>(nil)",
        "let receive = OSAllocatedUnfairLock<(@Sendable () -> Void)?>(initialState: nil)",
        "let receive: Mutex<Optional<@Sendable (Int) async throws -> Void>>",
        "let receive: Mutex<Swift.Optional<((@Sendable () async throws(Failure) -> sending Value))?>>",
        "let receive: Mutex<(((() -> Void)))>",
        "let receive: Mutex<((Int, String) -> (Bool, Int))?>",
        "let receive: Mutex<@convention(c) (Int32) -> Void>",
        "let receive: Synchronization.Mutex<(@Sendable (Result<[Int], any Error>) -> Void)?>",
        "let receive: Mutex<\n    Optional<\n        @Sendable (Int) async throws -> Void\n    >\n>",
        "let receive: Mutex</* state */ (@Sendable /* function */ () -> Void)?>",
        #"let text = "multiline\nstring"; let receive: Mutex<() -> Void>"#,
        #"let text = "interpolation \("inner")"; let receive: Mutex<() -> Void>"#,
    ])
    func findsWrittenFunctionTypes(_ source: String) async throws {
        let findings = try await scanFixture("// first line\n\n" + source)
        #expect(findings == [ClosureLockFinding(file: "Nested/Fixture.swift", line: 3)])
        #expect(findings.first?.description == "Nested/Fixture.swift:3: lock stores a function type; wrap the closure in a struct")
    }

    @Test(arguments: [
        "let receiver: Mutex<Receiver?>",
        "let receiver: OSAllocatedUnfairLock<Optional<Receiver>>",
        "struct Receiver { let receive: @Sendable (Int) -> Void }; let receiver = Mutex(Receiver(receive: work))",
        "let receiver: Mutex<(Int, String)>",
        "let receiver: Mutex<((() -> Void), Int)>",
        "let receiver: Mutex<(receive: () -> Void, count: Int)>",
        "let receiver: Mutex<((() -> Void),)>",
        "let receiver: Mutex<[() -> Void]>",
        "let receiver: Mutex<[String: @Sendable () -> Void]>",
        "let receiver: Mutex<Array<@Sendable () -> Void>>",
        "let receiver: Mutex<Optional<Box<() -> Void>>>",
        "let receiver: Mutex<(() -> Void).Type>",
        "let receiver = Mutex(someClosure)",
        "let receiver = Mutex(accept({ (value: Int) -> Void in }))",
        "let receiver = OSAllocatedUnfairLock(initialState: (() -> Void)?.none)",
        "let receiver = Mutex<Receiver>(Receiver(receive: { () -> Void in }))",
        "// let receiver: Mutex<() -> Void>\nlet receiver = Mutex(0)",
        "/* outer /* nested */ Mutex<() -> Void> */",
        #"let text = "Mutex<(@Sendable () -> Void)?>""#,
        #"let text = "escaped \" Mutex<() -> Void>""#,
        ##"let text = #"Mutex<() -> Void>"#"##,
        ####"let text = ###"a "quote" Mutex<() -> Void>"###"####,
        #"let text = "interpolation \("Mutex<() -> Void>")""#,
        ##"let text = #"interpolation \#("Mutex<() -> Void>")"#"##,
        #"""
        let text = """
        Mutex<() -> Void>
        """
        """#,
        ##"""
        let text = #"""
        """ Mutex<() -> Void>
        """#
        """##,
        "let NotMutex: Other<() -> Void>",
        "let receiver: MyMutex<() -> Void>",
    ])
    func allowsConcreteTypesAndIgnoresNonTypes(_ source: String) async throws {
        #expect(try await scanFixture(source).isEmpty)
    }

    @Test func reportsEveryLockAtItsOwnLine() async throws {
        let source = #"""
        /* nested /* comment */
           Mutex<() -> Void>
        */
        let text = """
        OSAllocatedUnfairLock<() -> Void>
        """
        let first: Mutex<() -> Void>
        let second: OSAllocatedUnfairLock<Optional<() async throws -> Void>>
        """#
        #expect(try await scanFixture(source) == [
            ClosureLockFinding(file: "Nested/Fixture.swift", line: 7),
            ClosureLockFinding(file: "Nested/Fixture.swift", line: 8),
        ])
    }

    @Test func ignoresNonSwiftFilesAndSortsFindingsByPath() async throws {
        try await withFixtureDirectory { directory in
            let findings = try await offPool {
                for file in ["z.swift", "a.swift", "ignored.txt"] {
                    try "let receiver: Mutex<() -> Void>".write(
                        to: directory.appendingPathComponent(file), atomically: true, encoding: .utf8
                    )
                }
                return try closureLockFindings(in: directory)
            }
            #expect(findings == [
                ClosureLockFinding(file: "a.swift", line: 1),
                ClosureLockFinding(file: "z.swift", line: 1),
            ])
        }
    }

    @Test func packageLocksStoreConcreteTypes() async throws {
        let package = URL(filePath: #filePath).deletingLastPathComponent()
            .deletingLastPathComponent().deletingLastPathComponent()
        let findings = try await offPool {
            try ["Sources", "Tests", "PreviewApps"].flatMap { name in
                try closureLockFindings(in: package.appendingPathComponent(name)).map {
                    ClosureLockFinding(file: name + "/" + $0.file, line: $0.line)
                }
            }
        }
        #expect(findings.isEmpty, "\(findings.map(\.description).joined(separator: "\n"))")
    }
}

private func scanFixture(_ source: String) async throws -> [ClosureLockFinding] {
    try await withFixtureDirectory { directory in
        try await offPool {
            let nested = directory.appendingPathComponent("Nested")
            try FileManager.default.createDirectory(at: nested, withIntermediateDirectories: true)
            try source.write(to: nested.appendingPathComponent("Fixture.swift"), atomically: true, encoding: .utf8)
            return try closureLockFindings(in: directory)
        }
    }
}

private func withFixtureDirectory<Value>(
    _ body: (URL) async throws -> Value
) async throws -> Value {
    let directory = try await offPool {
        let directory = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        return directory
    }
    return try await withCleanup {
        try await body(directory)
    } cleanup: {
        try FileManager.default.removeItem(at: directory)
    }
}
