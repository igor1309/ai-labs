import CallDetail
import Synchronization
import Testing

struct CallDetailVersionsTests {
    @Test func attributionAndBothVersionsArePublished() {
        let pair = makePair()
        assert(makeReading(), .readFinished(id: "call", revision: 4, result: .read(pair))) {
            $0.notes = .read(pair)
            $0.detail = makeDetail(pair: pair)
            $0.menuFacts = .init(call: "call", hasNotes: true, template: "daily-id", busy: false)
        }
    }

    @Test func choosingPreviousChangesTheCopyTextAndTemplate() {
        assert(makeShown(), .versionChosen(.previous)) {
            $0.detail?.version = .previous
            $0.detail?.content = .notes("previous Markdown", made: "yesterday")
            $0.detail?.template = "Default"
            $0.menuFacts?.template = "default-id"
        }
    }

    @Test func choosingCurrentRestoresItsCopyTextAndTemplate() {
        assert(makeShown(version: .previous), .versionChosen(.current)) {
            $0.detail?.version = .current
            $0.detail?.content = .notes("current Markdown", made: "today")
            $0.detail?.template = "Daily"
            $0.menuFacts?.template = "daily-id"
        }
    }

    @Test func aPublicationReadsAgainAndShowsTheNewCurrent() {
        let state = makeShown(version: .previous)
        assert(state, .publicationNotified(id: "call"), delivers: .read(id: "call", revision: 5)) {
            $0.notes = .notRead; $0.revision = 5; $0.showCurrentAfterRead = true
        }
        var newPair = makePair()
        newPair.current.text = "newly published notes"
        let reading = makeReading(version: .previous)
        assert(reading, .readFinished(id: "call", revision: 4, result: .read(newPair))) {
            $0.notes = .read(newPair)
            $0.detail = makeDetail(pair: newPair)
            $0.menuFacts = .init(call: "call", hasNotes: true, template: "daily-id", busy: false)
        }
    }

    @Test func aPublicationWithIdenticalTextAndDisplayDatesStillShowsCurrent() {
        let reading = makeReading(version: .previous) { $0.showCurrentAfterRead = true }
        assert(reading, .readFinished(id: "call", revision: 4, result: .read(makePair()))) {
            $0.notes = .read(makePair()); $0.showCurrentAfterRead = false
            $0.detail = makeDetail()
            $0.menuFacts?.template = "daily-id"
        }
    }

    @Test func aRereadOfTheSamePairKeepsTheChosenVersion() {
        let pair = makePair()
        assert(makeReading(version: .previous), .readFinished(id: "call", revision: 4, result: .read(pair))) {
            $0.notes = .read(pair)
        }
    }

    @Test func progressKeepsThePairAndPublishesBusyFacts() {
        let state = makeReading(badge: .pending)
        let pair = makePair()
        assert(state, .readFinished(id: "call", revision: 4, result: .read(pair))) {
            $0.notes = .read(pair)
            $0.detail?.progress = "remaking Chosen template"
            $0.menuFacts?.busy = true
        }
    }

    @Test func aFailureKeepsThePairReadableBesideItsReason() {
        let pair = makePair()
        assert(makeReading(badge: .failed), .readFinished(id: "call", revision: 4, result: .read(pair))) {
            $0.notes = .read(pair)
            $0.detail?.failure = "generation failed"
        }
    }

    @Test func cancellationClearsProgressAndKeepsTheChosenVersion() {
        let state = makeReading(version: .previous) { $0.detail?.progress = "working"; $0.menuFacts?.busy = true }
        assert(state, .readFinished(id: "call", revision: 4, result: .read(makePair()))) {
            $0.notes = .read(makePair()); $0.detail?.progress = nil; $0.menuFacts?.busy = false
        }
    }

    @Test func cancelPublishesAnIntentionOnlyForABusyCall() {
        let busy = makeShown(badge: .pending)
        assert(busy, .cancelChosen) { $0.cancelCall = "call"; $0.cancellations = 1 }
        assert(makeShown(), .cancelChosen)
        assert(.init(), .cancelChosen)
    }

    @Test func unavailableOrAlreadyChosenVersionsChangeNothing() {
        assert(makeShown(), .versionChosen(.current))
        assert(.init(), .versionChosen(.previous))
        let single = makeShown {
            $0.detail?.pair?.previous = nil
            $0.notes = .read($0.detail!.pair!)
        }
        assert(single, .versionChosen(.previous))
    }

    @Test func progressFormattingIsInjectedAndRunsOnlyForProgress() {
        let spy = FormatSpy()
        let reducer = CallDetailReducer(progress: spy.format)
        #expect(spy.calls.withLock { $0 } == [])
        _ = reducer.reduce(makeShown(), .versionChosen(.current))
        _ = reducer.reduce(makeReading(), .readFinished(id: "call", revision: 4, result: .read(makePair())))
        #expect(spy.calls.withLock { $0 } == [])
        let state = reducer.reduce(makeReading(badge: .pending), .readFinished(id: "call", revision: 4, result: .read(makePair()))).0
        #expect(spy.calls.withLock { $0 } == ["Chosen template"])
        #expect(state.detail?.progress == "formatted progress")
    }

    @Test func theReadEffectPreservesBothVersionsAndTheirAttribution() async {
        let pair = makePair()
        let calls = Mutex<[String]>([])
        let handler = CallDetailEffectHandler(notes: { id in calls.withLock { $0.append(id) }; return pair })
        #expect(await handler.handle(.read(id: "call", revision: 4)) == .readFinished(id: "call", revision: 4, result: .read(pair)))
        #expect(calls.withLock { $0 } == ["call"])
    }
}
private final class FormatSpy: Sendable {
    let calls = Mutex<[String]>([])
    func format(_ template: String) -> String { calls.withLock { $0.append(template) }; return "formatted progress" }
}
private func makePair() -> CallNotesPair {
    .init(previous: .init(text: "previous Markdown", made: "yesterday", templateID: "default-id", templateName: "Default"),
          current: .init(text: "current Markdown", made: "today", templateID: "daily-id", templateName: "Daily"))
}
private func makeDetail(pair: CallNotesPair = makePair(), version: CallNotesVersion = .current) -> CallsDetail {
    let notes = version == .previous ? pair.previous! : pair.current
    return .init(id: "call", title: "Title", date: "Date", duration: "1:00", content: .notes(notes.text, made: notes.made),
                 pair: pair, version: version, template: notes.templateName)
}
private func makeShown(version: CallNotesVersion = .current, badge: CallDetailState.Call.Summary.Badge = .none,
                       change: (inout CallDetailState) -> Void = { _ in }) -> CallDetailState {
    var state = CallDetailState(selected: .init(id: "call", title: "Title", date: "Date", duration: "1:00", editable: true,
                                               summary: .init(badge: badge, status: "generation failed", canRetry: true, template: "Chosen template")),
                                notes: .read(makePair()), detail: makeDetail(version: version), revision: 4,
                                menuFacts: .init(call: "call", hasNotes: true, template: version == .previous ? "default-id" : "daily-id", busy: false))
    change(&state); return state
}
private func makeReading(version: CallNotesVersion = .current, badge: CallDetailState.Call.Summary.Badge = .none,
                         change: (inout CallDetailState) -> Void = { _ in }) -> CallDetailState {
    var state = makeShown(version: version, badge: badge)
    state.notes = .notRead
    change(&state); return state
}
private func assert(_ state: CallDetailState, _ event: CallDetailEvent, delivers effect: CallDetailEffect? = nil,
                    sourceLocation: SourceLocation = #_sourceLocation, mutation: (inout CallDetailState) -> Void = { _ in }) {
    var expected = state; mutation(&expected)
    let result = CallDetailReducer(progress: { "remaking " + $0 }).reduce(state, event)
    #expect(result.0 == expected, sourceLocation: sourceLocation)
    #expect(result.1 == effect, sourceLocation: sourceLocation)
}
