@testable import NerisCore
import Testing

struct FilterResultTests {

    @Test(arguments: ["", " ", "  ", "\t", " \t ", "\n", "\r", "\r\n"])
    func test_shouldReturnSkip_onEmptyOrWhitespace(_ input: String) {
        #expect(FilterResult(input) == .skip)
    }

    @Test(arguments: ["exit", "quit", "q", "EXIT", "eXiT", "Quit", "Q"])
    func test_shouldReturnQuit_onExitInput(_ input: String) {
        #expect(FilterResult(input) == .quit)
    }

    @Test func test_shouldReturnInput_onNonExitNonEmpty() {

        let input = makeSomeString()
        #expect(FilterResult(input) == .input(input))
    }

    @Test func test_shouldTrimWhitespace_onInput() {

        let input = makeSomeString()
        #expect(FilterResult("  \(input)  ") == .input(input))
    }
}
