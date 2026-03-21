import NerisCore
import Testing

struct GreetTests {

    @Test func greet() {

        // greet() prints to stdout — verifying it compiles and links
        NerisCore.greet()
    }
}
