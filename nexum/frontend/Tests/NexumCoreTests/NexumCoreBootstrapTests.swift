@testable import NexumCore
import XCTest

final class NexumCoreBootstrapTests: XCTestCase {

    func test_message_shouldReturnReadyMessage_onBootstrapCall() {
        XCTAssertEqual(NexumCoreBootstrap.message(), "NexumCore ready")
    }
}
