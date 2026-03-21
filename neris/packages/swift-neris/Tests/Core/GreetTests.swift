import NerisCore
import Testing

struct GreetTests {

    @Test func greet() async throws {

        // greet() prints to stdout — verifying it compiles and links
        let agent = Agent()
        try await agent.greet()
    }
}
