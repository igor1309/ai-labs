@testable import NerisCore
import Testing

struct AgentTests {

    @Test func test_shouldReturnInput() async throws {

        let input = makeSomeString()
        let agent = Agent()

        let result = try await agent.process(input)

        #expect(result == input)
    }
}
