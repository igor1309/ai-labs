import FolioTellCore
import Testing

struct PlaybackPositionEffectHandlerTests {

    @Test func test_init_shouldNotCallCollaborators() {

        let (_, log) = makeSUT()

        #expect(log.calls.isEmpty)
    }

    @Test func test_handleEffect_shouldPersistOnlyWithPathAndAnchor_onPersistAnchor() {

        let (sut, log) = makeSUT()

        sut.handleEffect(.persistAnchor(documentPath: "/doc.md", anchor: 16)) { _ in }

        #expect(log.calls == [.persistAnchor("/doc.md", 16)])
    }

    @Test func test_handleEffect_shouldDeliverNothing_onPersistAnchor() {

        let (sut, _) = makeSUT()

        expect(sut, with: .persistAnchor(documentPath: "/doc.md", anchor: 16), toDeliver: nil)
    }

    @Test func test_handleEffect_shouldClearOnlyWithPath_onClearAnchor() {

        let (sut, log) = makeSUT()

        sut.handleEffect(.clearAnchor(documentPath: "/other.md")) { _ in }

        #expect(log.calls == [.clearAnchor("/other.md")])
    }

    @Test func test_handleEffect_shouldDeliverNothing_onClearAnchor() {

        let (sut, _) = makeSUT()

        expect(sut, with: .clearAnchor(documentPath: "/doc.md"), toDeliver: nil)
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

    private func expect(
        _ sut: SUT,
        with effect: PlaybackPositionEffect,
        toDeliver expected: PlaybackPositionEvent?,
        sourceLocation: SourceLocation = #_sourceLocation
    ) {

        var delivered = [PlaybackPositionEvent]()

        sut.handleEffect(effect) { delivered.append($0) }

        #expect(delivered == (expected.map { [$0] } ?? []), sourceLocation: sourceLocation)
    }
}

private final class StoreLog {

    enum Call: Equatable {
        case persistAnchor(String, Int)
        case clearAnchor(String)
    }

    var calls = [Call]()
}
