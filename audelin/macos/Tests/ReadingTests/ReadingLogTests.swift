import Reading
import Testing

struct ReadingLogTests {
    @Test func logSelectionKeepsAvailableRowsAndHolds() {
        let held = ReadingState.Held(entryID: 1, text: " exact ")
        let entry = ReadingState.Entry(id: 1, time: "given", speaker: .mine)
        let withHolds = ReadingState.Lines(holds: [held])
        let withRows = ReadingState.Lines(rows: [.entry(entry)])
        let withBoth = ReadingState.Lines(rows: [.entry(entry)], holds: [held])
        let contents: [(ReadingState.Lines, ReadingState.Log, ReadingState.Log)] = [
            (.init(), .empty, .liveTextOff(kept: nil)),
            (withHolds, .lines(withHolds), .liveTextOff(kept: withHolds)),
            (withRows, .lines(withRows), .liveTextOff(kept: withRows)),
            (withBoth, .lines(withBoth), .liveTextOff(kept: withBoth)),
        ]
        for (lines, stopped, liveTextOff) in contents {
            let cases: [(ReadingTextUpdate.Status, ReadingState.Log, ReadingState.Log)] = [
                (.off, stopped, liveTextOff),
                (.gettingReady, .preparing(holds: lines.holds), .preparing(holds: lines.holds)),
                (.listening, .lines(lines), .lines(lines)),
                (.failed("failure"), .lines(lines), .lines(lines)),
                (.finished, .lines(lines), .lines(lines)),
            ]
            for (status, stoppedLog, recordingLog) in cases {
                for (recording, expected) in [(ReadingState.Recording.off, stoppedLog), (.on(elapsed: "given"), recordingLog)] {
                    let spy = RenderingSpy()
                    let state = ReadingState(recording: recording, captureBegan: true, status: status, lines: lines)
                    assert(state, .jumpToLive, delivers: nil, using: makeReducer(spy)) { $0.log = expected }
                    #expect(spy.calls.isEmpty)
                    #expect(spy.layoutCalls.isEmpty)
                }
            }
            for recording: ReadingState.Recording in [.off, .on(elapsed: "given")] {
                let spy = RenderingSpy()
                let state = ReadingState(banners: [.init(kind: .callSilent, time: "given")], recording: recording,
                                         captureBegan: true, status: .gettingReady, lines: lines)
                assert(state, .jumpToLive, delivers: nil, using: makeReducer(spy)) { $0.log = .lines(lines) }
                #expect(spy.calls.isEmpty)
                #expect(spy.layoutCalls.isEmpty)
            }
        }
    }

    @Test func holdsSurviveLayoutChangesAndRecordingTransitions() {
        let held = ReadingState.Held(entryID: 1, text: " exact \n text ")
        let state = ReadingState(status: .listening, lines: .init(holds: [held]), rendered: .init(prepared: true))
        let events: [ReadingEvent] = [
            .textUpdated(.init(status: .listening, entries: [])),
            .textUpdated(.init(status: .off, entries: [])),
            .textUpdated(.init(status: .gettingReady, entries: [])),
            .textUpdated(.init(status: .failed("failure"), entries: [])),
            .textUpdated(.init(status: .finished, entries: [])),
            .recordingChanged(.off), .recordingChanged(.on(elapsed: 0)),
            .problemsChanged([.init(.microphone, began: 4)]), .scrolled(atBottom: false), .jumpToLive,
        ]
        for event in events {
            let spy = RenderingSpy(result: { $0.rows = []; $0.text = [:]; $0.anchors = [:] })
            let result = makeReducer(spy).reduce(state, event)
            #expect(result.0.lines.holds == [held])
            #expect(result.1 == nil)
        }
    }

    @Test func lettingGoRemovesOnlyTheMatchingHold() {
        let first = ReadingState.Held(entryID: 1, text: "first")
        let second = ReadingState.Held(entryID: 2, text: "second")
        let state = ReadingState(captureBegan: true, log: .lines(.init(holds: [first, second])), lines: .init(holds: [first, second]))
        let spy = RenderingSpy()
        assert(state, .letGo(first), delivers: nil, using: makeReducer(spy)) {
            $0.lines.holds = [second]
            $0.log = .lines($0.lines)
        }
        assert(state, .letGo(.init(entryID: 1, text: "different text")), delivers: nil, using: makeReducer(spy))
        #expect(spy.layoutCalls.isEmpty)
    }
}
