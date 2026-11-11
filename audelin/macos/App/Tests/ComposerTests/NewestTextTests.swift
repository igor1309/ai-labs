import LiveText
@testable import CallText
import Testing
@testable import Composer

struct NewestTextTests {
    @Test(arguments: [20, 60])
    func textWaitingForAStalledPanelStaysSmall(states: Int) async {
        let text = NewestText()
        for count in 1...states {
            let entries = (1...count).map { index in
                let word = Word("word\(index)", start: Double(index), end: Double(index + 1))
                let segment = TranscriptSegment(id: index, start: word.start, end: word.end, words: [word], settledCount: 1)
                return CallState.Entry(speaker: .mine, text: segment, writtenLater: false)
            }
            text.yield(.init(status: .listening, entries: .init(tail: entries)))
        }
        text.finish()
        var received: [CallState] = []
        for await state in text.stream { received.append(state) }
        #expect(received.count == 1)
        #expect(received.first?.entries.map { $0.text.words.prefix($0.text.settledCount).map(\.text).joined(separator: " ") } == (1...states).map { "word\($0)" })
    }

    @Test func aHeldReadingConsumerSkipsStatesButNotTheListeningOneThatWithdrewAnEntry() async {
        let text = NewestText()
        let first = CallState.Entry(speaker: .mine, text: .init(id: 1, start: 0, end: 1, words: [.init("withdrawn", start: 0, end: 1)], settledCount: 1), writtenLater: false)
        let other = CallState.Entry(speaker: .theirs, text: .init(id: 1, start: 2, end: 3, words: [.init("kept", start: 2, end: 3)], settledCount: 1), writtenLater: false)
        text.yield(.init(status: .listening, entries: [first, other]))
        text.yield(.init(status: .listening, entries: [other]))
        text.yield(.init(status: .off, entries: []))
        text.finish()
        var received: [CallState] = []
        for await state in text.stream { received.append(state) }
        #expect(received == [.init(status: .listening, entries: [other]), .init(status: .off, entries: [])])
    }
}
