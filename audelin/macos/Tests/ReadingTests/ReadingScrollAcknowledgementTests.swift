import Foundation
import Reading
import Testing

struct ReadingScrollAcknowledgementTests {

    @Test(arguments: [false, true])
    func eachScrollAcknowledgesItsIdentityWithoutABooleanTransition(atBottom: Bool) {

        let state = makeReading(atBottom: atBottom, acknowledgement: previous)
        assert(state, .scrolled(atBottom: atBottom, interaction: latest)) {
            $0.scrollAcknowledgement = latest
        }
    }

    @Test(arguments: [false, true])
    func acknowledgingAScrollHasNoEffect(atBottom: Bool) {

        assert(makeReading(atBottom: atBottom, acknowledgement: previous), .scrolled(atBottom: atBottom, interaction: latest), delivers: nil) {
            $0.scrollAcknowledgement = latest
        }
    }

    @Test(arguments: [false, true])
    func legacyScrollRetainsTheLastAcknowledgement(atBottom: Bool) {

        assert(makeReading(atBottom: atBottom, acknowledgement: latest), .scrolled(atBottom: atBottom))
    }

    @Test(arguments: [false, true])
    func legacyScrollHasNoEffect(atBottom: Bool) {

        assert(makeReading(atBottom: atBottom, acknowledgement: latest), .scrolled(atBottom: atBottom), delivers: nil)
    }

    @Test func jumpKeepsTheIdentityOfTheScrollItFollows() {

        assert(makeReading(atBottom: true, acknowledgement: latest), .jumpToLive)
    }

    @Test func jumpHasNoEffect() {

        assert(makeReading(atBottom: true, acknowledgement: latest), .jumpToLive, delivers: nil)
    }

    @Test func textUpdatesKeepTheReaderAcknowledgement() {

        assert(makeReading(atBottom: true, acknowledgement: latest), .textUpdated(.init(status: .off, entries: [])))
    }

    @Test func textUpdateHasNoEffect() {

        assert(makeReading(atBottom: true, acknowledgement: latest), .textUpdated(.init(status: .off, entries: [])), delivers: nil)
    }
}

private let previous = UUID(uuid: (0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1))
private let latest = UUID(uuid: (0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 2))

private func makeReading(atBottom: Bool, acknowledgement: UUID) -> ReadingState {

    var state = ReadingReducer.reduce(.init(), .scrolled(atBottom: atBottom)).0
    state.scrollAcknowledgement = acknowledgement
    return state
}

private func assert(
    _ state: ReadingState, _ event: ReadingEvent, sourceLocation: SourceLocation = #_sourceLocation,
    changes: (inout ReadingState) -> Void = { _ in }
) {

    var expected = state
    changes(&expected)
    #expect(ReadingReducer.reduce(state, event).0 == expected, sourceLocation: sourceLocation)
}
