import NerisCore
import Testing

struct AgentTests {

    @Test func process() async throws {

        let agent = Agent()
        try await agent.process("hello")
    }
}
