import NerisCore
import Testing

struct InputFilterTests {

    @Test(arguments: ["", " ", "  ", "\t", " \t "])
    func test_shouldReturnSkip_onEmptyOrWhitespace(_ input: String) {
        #expect(filterResult(input) == .skip)
    }

    @Test(arguments: ["exit", "quit", "q"])
    func test_shouldReturnQuit_onExitInput(_ input: String) {
        #expect(filterResult(input) == .quit)
    }

    @Test func test_shouldReturnInput_onNonExitNonEmpty() {
        #expect(filterResult("hello") == .input("hello"))
    }

    @Test func test_shouldTrimWhitespace_onInput() {
        #expect(filterResult("  hello  ") == .input("hello"))
    }
}

// MARK: - Helpers

private typealias SUT = InputFilter

private func makeSUT() -> SUT {
    SUT()
}

private func filterResult(_ input: String) -> InputFilter.Result {
    makeSUT().filter(input)
}
