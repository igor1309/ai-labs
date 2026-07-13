import FolioTellCore
import Testing

@MainActor
struct PlaybackPositionEffectHandlerTests {

    @Test func test_init_shouldNotCallCollaborators() {

        let (_, log) = makeSUT()

        #expect(log.calls.isEmpty)
    }

    @Test func test_handleEffect_shouldPersistAnchorWithPathAndValue_onPersistAnchor() {

        let (sut, log) = makeSUT()

        sut.handleEffect(.persistAnchor(documentPath: "/doc.md", anchor: 16)) { _ in }

        #expect(log.calls == [.persistAnchor("/doc.md", 16)])
    }

    @Test func test_handleEffect_shouldClearAnchorWithPath_onClearAnchor() {

        let (sut, log) = makeSUT()

        sut.handleEffect(.clearAnchor(documentPath: "/doc.md")) { _ in }

        #expect(log.calls == [.clearAnchor("/doc.md")])
    }

    // MARK: - Helpers

    private typealias SUT = PlaybackPositionEffectHandler

    private func makeSUT() -> (sut: SUT, log: StoreLog) {

        let log = StoreLog()
        let sut = SUT(
            persistAnchor: { log.calls.append(.persistAnchor($0, $1)) },
            clearAnchor: { log.calls.append(.clearAnchor($0)) }
        )
        return (sut, log)
    }
}

@MainActor
private final class StoreLog {

    enum Call: Equatable {
        case persistAnchor(String, Int)
        case clearAnchor(String)
    }

    var calls = [Call]()
}
