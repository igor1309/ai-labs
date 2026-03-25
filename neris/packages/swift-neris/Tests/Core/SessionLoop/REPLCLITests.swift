import NerisCore
import Testing

final class REPLCLITests: TestContext {

    @Test func test_shouldYieldTurnOutput_onValidInput() async throws {
        let output = makeSomeString()
        let spy = makeSUT(
            lines: [makeSomeString()],
            turnOutput: [output]
        )

        await spy.waitForFinish()
        #expect(spy.values == [output])
    }

    @Test func test_shouldSkip_onEmptyInput() async throws {
        let output = makeSomeString()
        let spy = makeSUT(
            lines: ["", makeSomeString()],
            turnOutput: [output]
        )

        await spy.waitForFinish()
        #expect(spy.values == [output])
    }

    @Test func test_shouldSkip_onWhitespaceInput() async throws {
        let output = makeSomeString()
        let spy = makeSUT(
            lines: ["  \t ", makeSomeString()],
            turnOutput: [output]
        )

        await spy.waitForFinish()
        #expect(spy.values == [output])
    }

    @Test(arguments: ["exit", "quit", "q", "EXIT", "Quit", "Q"])
    func test_shouldFinishWithoutTurnOutput_onQuitInput(_ quit: String) async throws {
        let spy = makeSUT(
            lines: [quit],
            turnOutput: [makeSomeString()]
        )

        await spy.waitForFinish()
        #expect(spy.values.isEmpty)
    }

    @Test func test_shouldTrimWhitespace_onInput() async throws {
        let input = makeSomeString()
        let received = Received()
        let spy = makeSUT(lines: ["  \(input)  "]) { message in
            received.append(message)
            return AsyncStream { $0.finish() }
        }

        await spy.waitForFinish()
        #expect(received.values == [input])
    }

    @Test func test_shouldProcessMultipleInputs_beforeQuit() async throws {
        let (first, second) = (makeSomeString(), makeSomeString())
        let spy = makeSUT(
            lines: ["", first, "  ", second, "q"],
            turnOutput: ["re: \(first)", "re: \(second)"]
        )

        await spy.waitForFinish()
        #expect(spy.values == ["re: \(first)", "re: \(second)"])
    }

    @Test func test_shouldFinish_onNilFromReader() async throws {
        let spy = makeSUT(lines: [], turnOutput: [])

        await spy.waitForFinish()
        #expect(spy.values.isEmpty)
        #expect(spy.isFinished)
    }

    // MARK: - Helpers

    private typealias SUT = REPL<String, String>

    private func makeSUT(
        lines: [String],
        turnOutput: [String],
        _ sourceLocation: SourceLocation = #_sourceLocation
    ) -> StreamSpy<String> {
        let turn = ScriptedTurn(turnOutput)
        return makeSUT(lines: lines, turn: turn.run)
    }

    private func makeSUT(
        lines: [String],
        turn: @escaping @Sendable (String) -> AsyncStream<String>,
        _ sourceLocation: SourceLocation = #_sourceLocation
    ) -> StreamSpy<String> {
        let reader = ScriptedReader(lines)
        let sut = SUT.cli(reader: reader.read, turn: turn)
        return StreamSpy(sut.run())
    }

    private final class Received: @unchecked Sendable {
        private(set) var values = [String]()
        func append(_ value: String) { values.append(value) }
    }

    private final class ScriptedReader: @unchecked Sendable {
        private var lines: [String]
        init(_ lines: [String]) { self.lines = lines }
        func read() -> String? {
            guard !lines.isEmpty else { return nil }
            return lines.removeFirst()
        }
    }

    private final class ScriptedTurn: @unchecked Sendable {
        private var outputs: [String]
        init(_ outputs: [String]) { self.outputs = outputs }
        func run(_ input: String) -> AsyncStream<String> {
            let output = outputs.isEmpty ? nil : outputs.removeFirst()
            return AsyncStream {
                if let output { $0.yield(output) }
                $0.finish()
            }
        }
    }
}
