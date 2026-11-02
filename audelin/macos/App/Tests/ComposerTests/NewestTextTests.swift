@testable import CallText
import Testing
@testable import Composer

struct NewestTextTests {
    @Test(arguments: [20, 60])
    func textWaitingForAStalledPanelStaysSmall(states: Int) async {
        let text = NewestText()
        for count in 1...states {
            text.yield(.init(status: .listening, entries: .init(tail: (1...count).map {
                State.Entry(speaker: .mine, text: .init(id: $0, start: Double($0), end: Double($0 + 1), settled: "word\($0)"), writtenLater: false)
            })))
        }
        text.finish()
        var received: [State] = []
        for await state in text.stream { received.append(state) }
        #expect(received.count == 1)
        #expect(received.first?.entries.map(\.text.settled) == (1...states).map { "word\($0)" })
    }

    @Test func aHeldReadingConsumerSkipsStatesButNotTheListeningOneThatWithdrewAnEntry() async {
        let text = NewestText()
        let first = State.Entry(speaker: .mine, text: .init(id: 1, start: 0, end: 1, settled: "withdrawn"), writtenLater: false)
        let other = State.Entry(speaker: .theirs, text: .init(id: 1, start: 2, end: 3, settled: "kept"), writtenLater: false)
        text.yield(.init(status: .listening, entries: [first, other]))
        text.yield(.init(status: .listening, entries: [other]))
        text.yield(.init(status: .off, entries: []))
        text.finish()
        var received: [State] = []
        for await state in text.stream { received.append(state) }
        #expect(received == [.init(status: .listening, entries: [other]), .init(status: .off, entries: [])])
    }
}
