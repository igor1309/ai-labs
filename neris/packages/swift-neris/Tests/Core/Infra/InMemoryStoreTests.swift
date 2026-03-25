import NerisCore
import Testing

final class InMemoryStoreTests: TestContext {

    @Test func test_shouldBeEmpty_onCreationWithNoElements() {
        let sut = makeSUT([])

        #expect(sut.all().isEmpty)
    }

    @Test func test_shouldContainOneElement_onCreationWithOneElement() {
        let element = makeElement()
        let sut = makeSUT([element])

        #expect(sut.all() == [element])
    }

    @Test func test_shouldContainTwoElements_onCreationWithTwoElements() {
        let elements = [makeElement(), makeElement()]
        let sut = makeSUT(elements)

        #expect(sut.all() == elements)
    }

    @Test func test_shouldContainElement_onAppend() {
        let element = makeElement()
        let sut = makeSUT()

        sut.append(element)

        #expect(sut.all() == [element])
    }

    @Test func test_shouldPreserveOrder_onMultipleAppends() {
        let (first, second, third) = (makeElement(), makeElement(), makeElement())
        let sut = makeSUT()

        sut.append(first)
        sut.append(second)
        sut.append(third)

        #expect(sut.all() == [first, second, third])
    }

    @Test func test_shouldAppendAfterSeeded_onAppendToSeededStore() {
        let seeded = [makeElement(), makeElement()]
        let appended = makeElement()
        let sut = makeSUT(seeded)

        sut.append(appended)

        #expect(sut.all() == seeded + [appended])
    }

    // MARK: - Helpers

    private typealias SUT = InMemoryStore<Element>

    private func makeSUT(
        _ elements: [Element] = [],
        _ sourceLocation: SourceLocation = #_sourceLocation
    ) -> SUT {
        let sut = SUT(elements)
        trackForMemoryLeaks(sut, sourceLocation: sourceLocation)
        return sut
    }

    private struct Element: Equatable, Sendable {
        let value: String
    }

    private func makeElement(
        _ value: String = makeSomeString()
    ) -> Element {
        .init(value: value)
    }
}
