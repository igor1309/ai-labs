@testable import NerisCore
import Testing

final class InputFilterTests: TestContext {

    @Test(arguments: ["", " ", "  ", "\t", " \t "])
    func test_shouldReturnSkip_onEmptyOrWhitespace(_ input: String) {
        #expect(filterResult(input) == .skip)
    }

    @Test(arguments: ["exit", "quit", "q"])
    func test_shouldReturnQuit_onExitInput(_ input: String) {
        #expect(filterResult(input) == .quit)
    }

    @Test func test_shouldReturnInput_onNonExitNonEmpty() {

        let input = makeSomeString()
        #expect(filterResult(input) == .input(input))
    }

    @Test func test_shouldTrimWhitespace_onInput() {

        let input = makeSomeString()
        #expect(filterResult("  \(input)  ") == .input(input))
    }

    // MARK: - Helpers

    private typealias SUT = InputFilter

    private func makeSUT(_ sourceLocation: SourceLocation = #_sourceLocation) -> SUT {

        let sut = SUT()
        trackForMemoryLeaks(sut, sourceLocation: sourceLocation)
        return sut
    }

    private func filterResult(_ input: String) -> FilterResult {
        makeSUT().filter(input)
    }
}
