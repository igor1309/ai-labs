import LatestText
import Testing

/// Even numbers replace; odd numbers add.
private func makeSUT() -> LatestText<Int> {
    LatestText { $0.isMultiple(of: 2) }
}

private func drain(_ sut: LatestText<Int>) async -> [Int] {
    var received: [Int] = []
    for await element in sut.stream { received.append(element) }
    return received
}

struct LatestTextTests {
    @Test func aStalledReaderReceivesOnlyTheNewestReplacingElement() async {
        let sut = makeSUT()
        for element in stride(from: 2, through: 40, by: 2) { sut.yield(element) }
        sut.finish()
        #expect(await drain(sut) == [40])
    }

    @Test func anAddedElementKeepsTheReplacementSnapshotBeforeIt() async {
        let sut = makeSUT()
        sut.yield(2)
        sut.yield(4)
        sut.yield(5)
        sut.yield(7)
        sut.finish()
        #expect(await drain(sut) == [4, 7])
    }

    @Test func addedElementsWithoutAReplacementKeepOnlyTheNewest() async {
        let sut = makeSUT()
        sut.yield(1)
        sut.yield(3)
        sut.finish()
        #expect(await drain(sut) == [3])
    }

    @Test func aReplacingElementDropsTheSnapshotAndAdditionsBeforeIt() async {
        let sut = makeSUT()
        sut.yield(2)
        sut.yield(3)
        sut.yield(6)
        sut.finish()
        #expect(await drain(sut) == [6])
    }

    @Test func elementsAfterFinishAreDropped() async {
        let sut = makeSUT()
        sut.yield(2)
        sut.finish()
        sut.yield(4)
        #expect(await drain(sut) == [2])
    }

    @Test func aWaitingReaderReceivesTheNextElementThenTheEnd() async {
        let sut = makeSUT()
        let reader = Task { await drain(sut) }
        sut.yield(1)
        sut.finish()
        #expect(await reader.value == [1])
    }

    @Test(.timeLimit(.minutes(1))) func cancellingAWaitingReaderEndsItsStream() async {
        let sut = makeSUT()
        let reader = Task { await drain(sut) }
        reader.cancel()
        #expect(await reader.value == [])
    }
}
