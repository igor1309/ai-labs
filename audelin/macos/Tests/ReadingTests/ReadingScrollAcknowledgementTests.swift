import Foundation
import Reading
import Testing

struct ReadingScrollAcknowledgementTests {

    @Test(arguments: [false, true])
    func eachScrollAcknowledgesItsIdentityWithoutABooleanTransition(atBottom: Bool) {

        let spy = RenderingSpy()
        assert(makeReading(atBottom: atBottom, acknowledgement: previous), .scrolled(atBottom: atBottom, interaction: latest),
               delivers: nil, using: makeReducer(spy)) {
            $0.scrollAcknowledgement = latest
        }
        #expect(spy.calls == [])
    }

    @Test(arguments: [false, true])
    func legacyScrollRetainsTheLastAcknowledgement(atBottom: Bool) {

        let spy = RenderingSpy()
        assert(makeReading(atBottom: atBottom, acknowledgement: latest), .scrolled(atBottom: atBottom),
               delivers: nil, using: makeReducer(spy))
        #expect(spy.calls == [])
    }

    @Test func jumpKeepsTheIdentityOfTheScrollItFollows() {

        let spy = RenderingSpy()
        assert(makeReading(atBottom: true, acknowledgement: latest), .jumpToLive, delivers: nil, using: makeReducer(spy))
        #expect(spy.calls == [])
    }

    @Test func textUpdatesKeepTheReaderAcknowledgement() {

        let spy = RenderingSpy()
        assert(makeReading(atBottom: true, acknowledgement: latest), .textUpdated(.init(status: .off, entries: [])),
               delivers: nil, using: makeReducer(spy)) {
            $0.lines.layout = 1
            $0.rendered = prepared()
        }
        #expect(spy.calls == [])
    }
}

private let previous = UUID(uuid: (0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1))
private let latest = UUID(uuid: (0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 2))

private func makeReading(atBottom: Bool, acknowledgement: UUID) -> ReadingState {

    var state = ReadingState(scrollAcknowledgement: acknowledgement)
    state.lines.followsLive = atBottom
    return state
}
