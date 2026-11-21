import Reading
import Testing

struct ReadingNamesChangedTests {
    @Test(arguments: [0, 1, 3], [false, true])
    func tentativeNamesReplaceOnlyTheLatestTextUpdate(sealed: Int, empty: Bool) {
        let spy = RenderingSpy()
        let names = empty ? [:] : [1: "ignored", 2: "New"]
        assert(makeNamedReading(sealed: sealed), .namesChanged(names, confirmed: false), delivers: nil, using: makeReducer(spy)) {
            $0.names = names
            rename(&$0, at: 1, name: names[2], confirmed: false)
        }
        #expect(spy.calls.isEmpty)
        #expect(spy.layoutCalls.isEmpty)
    }

    @Test(arguments: [0, 1, 3])
    func aFirstTentativeNameReachesAnEarlierRow(sealed: Int) {
        let spy = RenderingSpy()
        var state = makeNamedReading(sealed: sealed)
        state.names = [2: "Live"]
        rename(&state, at: 0, name: nil, confirmed: false, mapped: false)
        let names = [1: "Found", 2: "Live"]
        assert(state, .namesChanged(names, confirmed: false), delivers: nil, using: makeReducer(spy)) {
            $0.names = names
            rename(&$0, at: 0, name: "Found", confirmed: false)
        }
        #expect(spy.calls.isEmpty)
        #expect(spy.layoutCalls.isEmpty)
    }

    @Test(arguments: [0, 1, 3], [false, true])
    func confirmedNamesReachEveryRemoteEntryIncludingAfterRecordingEnds(sealed: Int, ended: Bool) {
        let spy = RenderingSpy()
        assert(makeNamedReading(sealed: sealed, ended: ended), .namesChanged([1: "Confirmed"], confirmed: true), delivers: nil, using: makeReducer(spy)) {
            $0.names = [1: "Confirmed"]
            $0.namesConfirmed = true
            rename(&$0, at: 0, name: "Confirmed", confirmed: true)
            rename(&$0, at: 1, name: nil, confirmed: false)
        }
        #expect(spy.calls.isEmpty)
        #expect(spy.layoutCalls.isEmpty)
    }

    @Test(arguments: [0, 1, 3])
    func confirmedEmptyReplacesAllLiveNames(sealed: Int) {
        let spy = RenderingSpy()
        assert(makeNamedReading(sealed: sealed), .namesChanged([:], confirmed: true), delivers: nil, using: makeReducer(spy)) {
            $0.names = [:]
            $0.namesConfirmed = true
            rename(&$0, at: 0, name: nil, confirmed: false)
            rename(&$0, at: 1, name: nil, confirmed: false)
        }
        #expect(spy.layoutCalls.isEmpty)
    }

    @Test(arguments: [false, true])
    func aNamedEntrySealedByATextUpdateKeepsTheLayoutRevision(confirmed: Bool) {
        let state = makeWaitingForText(confirmed: confirmed)
        let text = remote(7)
        let row = ReadingState.Entry(id: 0, time: "layout time", speaker: .theirs, settled: "x")
        let output = makeListening(entries: [text], rows: [.entry(row)], displayIDs: [0], sealed: 1)
        let spy = RenderingSpy(result: { $0 = snapshot(output) })
        let update = ReadingTextUpdate(status: .listening, entries: [text])
        assert(state, .textUpdated(update), delivers: nil, using: makeReducer(spy)) {
            $0.anchors = output.anchors
            $0.nextDisplayID = output.nextDisplayID
            $0.text = output.text
            $0.rendered = output.rendered
            $0.lines = output.lines
            $0.latestText = [text.id]
            rename(&$0, at: 0, name: "Later", confirmed: confirmed, mapped: false)
        }
        #expect(spy.layoutCalls == [.init(value: snapshot(state), change: .text(update))])
    }

    @Test(arguments: [false, true])
    func namesArrivingBeforeTextNameLaterEntries(confirmed: Bool) {
        let state = makeWaitingForText(confirmed: confirmed)
        let text = remote(7)
        let row = ReadingState.Entry(id: 0, time: "layout time", speaker: .theirs, settled: "x")
        let output = makeListening(entries: [text], rows: [.entry(row)], displayIDs: [0])
        let spy = RenderingSpy(result: { $0 = snapshot(output) })
        let update = ReadingTextUpdate(status: .listening, entries: [text])
        assert(state, .textUpdated(update), delivers: nil, using: makeReducer(spy)) {
            $0.anchors = output.anchors
            $0.nextDisplayID = output.nextDisplayID
            $0.text = output.text
            $0.rendered = output.rendered
            $0.lines = output.lines
            $0.latestText = [text.id]
            rename(&$0, at: 0, name: "Later", confirmed: confirmed)
        }
        #expect(spy.calls.isEmpty)
        #expect(spy.layoutCalls == [.init(value: snapshot(state), change: .text(update))])
    }

    @Test(arguments: [false, true])
    func laterTextKeepsSpeakerPlacesAndUsesTheReplacementNameSet(confirmed: Bool) {
        var state = makeNamedReading(sealed: 1)
        state.names = confirmed ? [:] : [2: "Replacement"]
        state.namesConfirmed = confirmed
        let text = remote(2)
        let revised = ReadingTextUpdate.Entry(id: text.id, start: text.start, end: text.end, settled: "revised")
        var output = snapshot(state)
        output.text[revised.id] = revised
        output.rendered.entries[revised.id] = .init(id: 2, time: "new time", speaker: .theirs, settled: "revised")
        output.rows[1] = .entry(output.rendered.entries[revised.id]!)
        let result = output
        let spy = RenderingSpy(result: { $0 = result })
        let update = ReadingTextUpdate(status: .listening, entries: [revised], from: 1, finalCount: 1)
        assert(state, .textUpdated(update), delivers: nil, using: makeReducer(spy)) {
            $0.text = result.text
            $0.rendered = result.rendered
            $0.lines.rows = result.rows
            $0.latestText = [revised.id]
            rename(&$0, at: 1, name: confirmed ? nil : "Replacement", confirmed: false, place: 2)
        }
        #expect(spy.layoutCalls == [.init(value: snapshot(state), change: .text(update))])
    }

    @Test(arguments: [false, true])
    func namesBeforeTextAreStoredWithoutLayout(confirmed: Bool) {
        let spy = RenderingSpy()
        assert(makeEmptyReading(), .namesChanged([7: "Later"], confirmed: confirmed), delivers: nil, using: makeReducer(spy)) {
            $0.names = [7: "Later"]
            $0.namesConfirmed = confirmed
        }
        #expect(spy.calls.isEmpty)
        #expect(spy.layoutCalls.isEmpty)
    }

    @Test(arguments: [false, true])
    func namesReachEntriesInsideWrittenLaterGroups(confirmed: Bool) {
        let state = makeLateReading()
        let spy = RenderingSpy()
        assert(state, .namesChanged([1: "Named"], confirmed: confirmed), delivers: nil, using: makeReducer(spy)) {
            $0.names = [1: "Named"]
            $0.namesConfirmed = confirmed
            let key = remote(1).id
            $0.rendered.entries[key]?.name = "Named"
            $0.rendered.entries[key]?.nameConfirmed = confirmed
            if case var .late(group) = $0.lines.rows[0] {
                group.entries[0].name = "Named"
                group.entries[0].nameConfirmed = confirmed
                $0.lines.rows[0] = .late(group)
            }
            $0.log = .lines($0.lines)
        }
        #expect(spy.layoutCalls.isEmpty)
    }

    @Test func confirmationWithTheSameNamesRemovesTentativeMarks() {
        let spy = RenderingSpy()
        assert(makeNamedReading(sealed: 3), .namesChanged([1: "Old", 2: "Live"], confirmed: true), delivers: nil, using: makeReducer(spy)) {
            $0.namesConfirmed = true
            rename(&$0, at: 0, name: "Old", confirmed: true)
            rename(&$0, at: 1, name: "Live", confirmed: true)
        }
        #expect(spy.calls.isEmpty)
        #expect(spy.layoutCalls.isEmpty)
    }

    @Test func identicalNamesChangeNothing() {
        let spy = RenderingSpy()
        assert(makeNamedReading(sealed: 3), .namesChanged([1: "Old", 2: "Live"], confirmed: false), delivers: nil, using: makeReducer(spy))
        #expect(spy.calls.isEmpty)
        #expect(spy.layoutCalls.isEmpty)
    }
}

private func makeNamedReading(sealed: Int, ended: Bool = false) -> ReadingState {
    let texts = [remote(1), remote(2), ReadingTextUpdate.Entry(id: .init(speaker: .mine, localID: 2), start: 3, end: 4, settled: "mine")]
    var state = makeListening(entries: texts, rows: [
        .entry(.init(id: 1, time: "first", speaker: .theirs, settled: "x", name: "Old", remoteSpeaker: 1)),
        .entry(.init(id: 2, time: "second", speaker: .theirs, settled: "x", name: "Live", remoteSpeaker: 2)),
        .entry(.init(id: 3, time: "third", speaker: .mine, settled: "mine")),
    ], displayIDs: [1, 2, 3], sealed: sealed)
    state.names = [1: "Old", 2: "Live"]
    state.latestText = [texts[1].id, texts[2].id]
    state.speakerPlaces = [1: 1, 2: 2]
    if ended { state.recording = .off; state.status = .finished }
    return state
}

private func makeWaitingForText(confirmed: Bool) -> ReadingState {
    ReadingState(captureBegan: true, log: .lines(.init()), status: .listening, names: [7: "Later"], namesConfirmed: confirmed, rendered: .init(prepared: true))
}

private func remote(_ id: Int) -> ReadingTextUpdate.Entry {
    .init(id: .init(speaker: .theirs, localID: id), start: Double(id), end: Double(id + 1), settled: "x")
}

private func rename(_ state: inout ReadingState, at row: Int, name: String?, confirmed: Bool, place: Int? = nil, mapped: Bool = true) {
    guard case var .entry(entry) = state.lines.rows[row] else { Issue.record("expected entry"); return }
    entry.name = name
    entry.nameConfirmed = confirmed
    if let place { entry.remoteSpeaker = place }
    let key = state.rendered.ordered[row]
    state.rendered.entries[key] = entry
    if state.lines.rows[row] != .entry(entry), mapped, row < state.lines.rows.sealed.count { state.lines.layout += 1 }
    state.lines.rows[row] = .entry(entry)
    state.log = .lines(state.lines)
}

private func makeEmptyReading() -> ReadingState { .init() }

private func makeLateReading() -> ReadingState {
    let text = remote(1)
    var state = makeListening(entries: [text], rows: [
        .late(.init(span: "given span", entries: [.init(id: 1, time: "given time", speaker: .theirs, settled: "x")]))
    ])
    state.latestText = [text.id]
    return state
}
