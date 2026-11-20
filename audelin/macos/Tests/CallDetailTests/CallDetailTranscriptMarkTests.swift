import CallDetail
import Synchronization
import Testing

@Suite(.timeLimit(.minutes(1)))
struct CallDetailTranscriptMarkTests {
    @Test(arguments: versions, [false, true])
    func currentTranscriptNotesAreUnmarked_state(version: CallNotesVersion, hasPrevious: Bool) {
        assertRead(makePair(version: version, identity: "current", hasPrevious: hasPrevious))
    }
    @Test(arguments: versions, [false, true])
    func currentTranscriptNotesAreUnmarked_effect(version: CallNotesVersion, hasPrevious: Bool) {
        assertReadEffect(makePair(version: version, identity: "current", hasPrevious: hasPrevious))
    }

    @Test(arguments: versions, [false, true])
    func otherTranscriptNotesUseFormatterText_state(version: CallNotesVersion, hasPrevious: Bool) {
        assertRead(makePair(version: version, identity: "other", hasPrevious: hasPrevious), marked: [version])
    }
    @Test(arguments: versions, [false, true])
    func otherTranscriptNotesUseFormatterText_effect(version: CallNotesVersion, hasPrevious: Bool) {
        assertReadEffect(makePair(version: version, identity: "other", hasPrevious: hasPrevious))
    }

    @Test(arguments: versions)
    func unknownNotesWithoutPreviousAreUnmarked_state(version: CallNotesVersion) {
        assertRead(makePair(version: version, identity: nil, hasPrevious: false))
    }
    @Test(arguments: versions)
    func unknownNotesWithoutPreviousAreUnmarked_effect(version: CallNotesVersion) {
        assertReadEffect(makePair(version: version, identity: nil, hasPrevious: false))
    }

    @Test(arguments: versions)
    func unknownNotesWithPreviousUseFormatterText_state(version: CallNotesVersion) {
        assertRead(makePair(version: version, identity: nil, hasPrevious: true), marked: [version])
    }
    @Test(arguments: versions)
    func unknownNotesWithPreviousUseFormatterText_effect(version: CallNotesVersion) {
        assertReadEffect(makePair(version: version, identity: nil, hasPrevious: true))
    }

    @Test(arguments: versions)
    func switchingVersionsShowsTheirOwnMark_state(version: CallNotesVersion) {
        let pair = makePair(version: .previous, identity: "other", hasPrevious: true)
        let state = makeShown(pair: pair, version: version == .current ? .previous : .current, marked: [.previous])
        let spy = MarkSpy()
        assert(state, .versionChosen(version), spy: spy) {
            $0.detail = makeDetail(pair: pair, version: version, marked: [.previous])
        }
        #expect(spy.calls.withLock { $0 }.isEmpty)
    }
    @Test(arguments: versions)
    func switchingVersionsShowsTheirOwnMark_effect(version: CallNotesVersion) {
        let pair = makePair(version: .previous, identity: "other", hasPrevious: true)
        let state = makeShown(pair: pair, version: version == .current ? .previous : .current, marked: [.previous])
        assert(state, .versionChosen(version), delivers: nil)
    }

    @Test func bothVersionsAreFormattedIndependently_state() {
        var pair = makePair(version: .previous, identity: "other", hasPrevious: true)
        pair.current.transcriptIdentity = nil
        assertRead(pair, marked: [.previous, .current])
    }
    @Test func bothVersionsAreFormattedIndependently_effect() {
        var pair = makePair(version: .previous, identity: "other", hasPrevious: true)
        pair.current.transcriptIdentity = nil
        assertReadEffect(pair)
    }

    @Test func transcriptChangeReadsShownCallAgain_state() {
        assert(makeShown(), .transcriptChanged(id: "call")) {
            $0.notes = .notRead
            $0.revision += 1
        }
    }
    @Test func transcriptChangeReadsShownCallAgain_effect() {
        assert(makeShown(), .transcriptChanged(id: "call"), delivers: .read(id: "call", revision: 5))
    }

    @Test(arguments: versions, [false, true])
    func transcriptChangeAndRestoreRecomputeMarks_state(version: CallNotesVersion, restored: Bool) {
        var pair = makePair(version: version, identity: "current", hasPrevious: true)
        pair.currentTranscriptIdentity = restored ? "replacement" : "current"
        let state = makeReading(pair: pair, version: version, marked: restored ? [.previous, .current] : [])
        pair.currentTranscriptIdentity = restored ? "current" : "replacement"
        let marked: [CallNotesVersion] = restored ? [] : [.previous, .current]
        let spy = MarkSpy()
        assert(state, .readFinished(id: "call", revision: 4, result: .read(pair)), spy: spy) {
            $0.notes = .read(pair)
            $0.detail = makeDetail(pair: pair, version: version, marked: marked)
        }
        #expect(spy.calls.withLock { $0 } == marked)
    }
    @Test(arguments: versions, [false, true])
    func transcriptChangeAndRestoreRecomputeMarks_effect(version: CallNotesVersion, restored: Bool) {
        var pair = makePair(version: version, identity: "current", hasPrevious: true)
        pair.currentTranscriptIdentity = restored ? "replacement" : "current"
        let state = makeReading(pair: pair, version: version, marked: restored ? [.previous, .current] : [])
        pair.currentTranscriptIdentity = restored ? "current" : "replacement"
        assert(state, .readFinished(id: "call", revision: 4, result: .read(pair)), delivers: nil)
    }

    @Test func transcriptRereadPreservesIdentityAndPreviousFacts() async {
        let pair = makePair(version: .previous, identity: "other", hasPrevious: true)
        let spy = NotesSpy()
        let sut = CallDetailEffectHandler(notes: { try await spy.read($0) })
        await expect(sut, with: .read(id: "call", revision: 5),
                     toDeliver: .readFinished(id: "call", revision: 5, result: .read(pair)),
                     on: { await spy.complete(.success(pair)) })
        #expect(await spy.ids == ["call"])
    }

    @Test(arguments: [false, true])
    func transcriptChangeDuringReadSupersedesAnswer_state(hasSelection: Bool) {
        let state = hasSelection ? makeReading() : makeEmpty()
        assert(state, .transcriptChanged(id: "call")) {
            if hasSelection { $0.revision += 1 }
        }
    }
    @Test(arguments: [false, true])
    func transcriptChangeDuringReadSupersedesAnswer_effect(hasSelection: Bool) {
        let state = hasSelection ? makeReading() : makeEmpty()
        assert(state, .transcriptChanged(id: "call"), delivers: hasSelection ? .read(id: "call", revision: 5) : nil)
    }

    @Test func anotherCallsTranscriptChangeIsIgnored_state() {
        assert(makeShown(), .transcriptChanged(id: "other"))
    }
    @Test func anotherCallsTranscriptChangeIsIgnored_effect() {
        assert(makeShown(), .transcriptChanged(id: "other"), delivers: nil)
    }

    @Test(arguments: [3, 4])
    func staleOrAlreadyReadResultsDoNotFormatMarks_state(revision: Int) {
        let pair = makePair(version: .current, identity: "other", hasPrevious: true)
        let spy = MarkSpy()
        assert(makeShown(), .readFinished(id: "call", revision: revision, result: .read(pair)), spy: spy)
        #expect(spy.calls.withLock { $0 }.isEmpty)
    }
    @Test(arguments: [3, 4])
    func staleOrAlreadyReadResultsDoNotFormatMarks_effect(revision: Int) {
        let pair = makePair(version: .current, identity: "other", hasPrevious: true)
        assert(makeShown(), .readFinished(id: "call", revision: revision, result: .read(pair)), delivers: nil)
    }

    @Test func knownNotesWithoutCurrentTranscriptAreMarked_state() {
        var pair = makePair(version: .current, identity: "known", hasPrevious: false)
        pair.currentTranscriptIdentity = nil
        pair.previous = nil
        assertRead(pair, marked: [.current])
    }
    @Test func knownNotesWithoutCurrentTranscriptAreMarked_effect() {
        var pair = makePair(version: .current, identity: "known", hasPrevious: false)
        pair.currentTranscriptIdentity = nil
        pair.previous = nil
        assertReadEffect(pair)
    }
}

private let versions: [CallNotesVersion] = [.previous, .current]

private final class MarkSpy: Sendable {
    let calls = Mutex<[CallNotesVersion]>([])
    func format(_ version: CallNotesVersion) -> String {
        calls.withLock { $0.append(version) }
        return text(version)
    }
}

private func text(_ version: CallNotesVersion) -> String {
    version == .previous ? "Previous mark stub" : "Current mark stub"
}

private func makePair(version: CallNotesVersion = .current, identity: String? = "current", hasPrevious: Bool = false) -> CallNotesPair {
    .init(previous: .init(text: "Previous notes", made: "Yesterday", transcriptIdentity: version == .previous ? identity : "current"),
          current: .init(text: "Current notes", made: "Today", transcriptIdentity: version == .current ? identity : "current"),
          currentTranscriptIdentity: "current", hasPreviousTranscript: hasPrevious)
}

private func makeDetail(pair: CallNotesPair, version: CallNotesVersion = .current, marked: [CallNotesVersion] = []) -> CallsDetail {
    let notes = version == .previous ? pair.previous! : pair.current
    return .init(id: "call", title: "Title", date: "Date", duration: "1:00", content: .notes(notes.text, made: notes.made),
                 pair: pair, version: version, template: notes.templateName,
                 previousTranscriptMark: marked.contains(.previous) ? text(.previous) : nil,
                 currentTranscriptMark: marked.contains(.current) ? text(.current) : nil,
                 transcriptMark: marked.contains(version) ? text(version) : nil)
}

private func makeEmpty() -> CallDetailState { .init() }

private func makeShown(pair: CallNotesPair = makePair(), version: CallNotesVersion = .current,
                       marked: [CallNotesVersion] = []) -> CallDetailState {
    .init(selected: .init(id: "call", title: "Title", date: "Date", duration: "1:00", editable: true,
                          summary: .init(badge: .none, status: "", canRetry: false)),
          notes: .read(pair), detail: makeDetail(pair: pair, version: version, marked: marked), revision: 4,
          menuFacts: .init(call: "call", hasNotes: true, template: "Default", busy: false))
}

private func makeReading(pair: CallNotesPair = makePair(), version: CallNotesVersion = .current,
                         marked: [CallNotesVersion] = []) -> CallDetailState {
    var state = makeShown(pair: pair, version: version, marked: marked)
    state.notes = .notRead
    return state
}

private func makeReducer(_ spy: MarkSpy) -> CallDetailReducer {
    let reducer = CallDetailReducer(progress: { $0 }, failure: { "\($0)" }, transcriptMark: spy.format)
    #expect(spy.calls.withLock { $0 }.isEmpty)
    return reducer
}

private func assertRead(_ pair: CallNotesPair, marked: [CallNotesVersion] = [], sourceLocation: SourceLocation = #_sourceLocation) {
    let spy = MarkSpy()
    assert(makeReading(), .readFinished(id: "call", revision: 4, result: .read(pair)), spy: spy, sourceLocation: sourceLocation) {
        $0.notes = .read(pair)
        $0.detail = makeDetail(pair: pair, marked: marked)
    }
    #expect(spy.calls.withLock { $0 } == marked, sourceLocation: sourceLocation)
}

private func assertReadEffect(_ pair: CallNotesPair, sourceLocation: SourceLocation = #_sourceLocation) {
    assert(makeReading(), .readFinished(id: "call", revision: 4, result: .read(pair)), delivers: nil, sourceLocation: sourceLocation)
}

private func assert(_ state: CallDetailState, _ event: CallDetailEvent, spy: MarkSpy = MarkSpy(),
                    sourceLocation: SourceLocation = #_sourceLocation, mutation: (inout CallDetailState) -> Void = { _ in }) {
    var expected = state
    mutation(&expected)
    #expect(makeReducer(spy).reduce(state, event).0 == expected, sourceLocation: sourceLocation)
}

private func assert(_ state: CallDetailState, _ event: CallDetailEvent, delivers effect: CallDetailEffect?,
                    sourceLocation: SourceLocation = #_sourceLocation) {
    #expect(makeReducer(MarkSpy()).reduce(state, event).1 == effect, sourceLocation: sourceLocation)
}

private func expect(_ sut: CallDetailEffectHandler, with effect: CallDetailEffect, toDeliver event: CallDetailEvent,
                    on complete: () async -> Void, sourceLocation: SourceLocation = #_sourceLocation) async {
    async let delivered = sut.handle(effect)
    await complete()
    #expect(await delivered == event, sourceLocation: sourceLocation)
}
