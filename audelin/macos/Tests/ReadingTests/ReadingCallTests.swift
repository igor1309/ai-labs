import Reading
import Testing

struct ReadingCallTests {
    @Test func openingTheNextCallClearsTheFinishedCall() {
        let spy = RenderingSpy()
        assert(makeFinishedCall(), .opened(2), delivers: nil, using: makeReducer(spy)) {
            $0 = .init(displayedCall: 2)
        }
        #expect(spy.calls.isEmpty && spy.layoutCalls.isEmpty)
    }

    @Test(arguments: [
        ReadingEvent.opened(1),
        .opened(2),
        .update(3, .recordingChanged(.on, at: 10)),
        .update(1, .recordingChanged(.on, at: 10)),
        .update(1, .textUpdated(.init(status: .finished, entries: []))),
        .update(1, .namesChanged([1: "Anna"], confirmed: true)),
        .update(1, .textEnded),
        .update(1, .speakersFound([1: 2])),
        .update(1, .scrolled(atBottom: false)),
    ])
    func earlierCallsCannotChangeTheDisplayedCall(event: ReadingEvent) {
        let spy = RenderingSpy()
        assert(makeFinishedCall(id: 2), event, delivers: nil, using: makeReducer(spy))
        #expect(spy.calls.isEmpty && spy.layoutCalls.isEmpty)
    }

    @Test func aClosedReadingKeepsItsLogAndIgnoresReaderActions() {
        let spy = RenderingSpy()
        let sut = makeReducer(spy)
        let state = makeFinishedCall()
        assert(state, .update(1, .sessionEnded), delivers: nil, using: sut) {
            $0.sessionEnded = true
        }
        var ended = state
        ended.sessionEnded = true
        assert(ended, .update(1, .feedsEnded), delivers: nil, using: sut) {
            $0.feedsEnded = true
        }
        ended.feedsEnded = true
        assert(ended, .update(1, .hold(.init(entryID: 1, text: "finished"))), delivers: nil, using: sut)
        #expect(spy.calls.isEmpty && spy.layoutCalls.isEmpty)
    }

    @Test func speakerPlacesWaitForTheLastText() {
        let spy = RenderingSpy()
        let sut = makeReducer(spy)
        assert(makeFinishedCall(), .update(1, .speakersFound([1: 2])), delivers: nil, using: sut) {
            $0.pendingSpeakerPlaces = [1: 2]
        }
        assert(makeFinishedCall(pending: [1: 2]), .update(1, .textEnded), delivers: nil, using: sut) {
            $0.textEnded = true
            $0.pendingSpeakerPlaces = nil
            $0.speakerPlaces = [1: 2]
        }
        #expect(spy.calls.isEmpty && spy.layoutCalls.isEmpty)
    }

    private func makeFinishedCall(id: UInt64 = 1, pending: [Int: Int]? = nil) -> ReadingState {
        .init(displayedCall: id, captureBegan: true, log: .lines(.init()), status: .finished,
              names: [1: "Anna"], namesConfirmed: true, pendingSpeakerPlaces: pending)
    }
}
