import CallsList
import Synchronization
import Testing

struct CallsListTagsEditorTests {
    @Test func S1_beginningStartsADraftFromTheCallsTags() {
        assert(makeState(), .beginTags("a", inUse: ["клиент", "банк"])) {
            $0.tagsEditor = .init(id: "a", draft: ["клиент"], inUse: ["клиент", "банк"])
        }
        assert(makeState(), .beginTags("a", inUse: []), delivers: nil)
    }

    @Test func aCallThatCannotBeEditedOrABusyListStartsNoDraft() {
        assert(makeState(rows: [row("a", editable: false)]), .beginTags("a", inUse: []))
        assert(makeState(busy: true), .beginTags("a", inUse: []))
        assert(makeState(), .beginTags("missing", inUse: []))
    }

    @Test func editingTheDraftCompletesTheEntryAgainstIt() {
        let complete = CompleteSpy("")
        let state = makeState(editor: .init(id: "a", draft: ["клиент", "банк"], entry: "к", completion: "лиент", inUse: ["клиент"]))
        assert(state, .editTags(["банк"]), using: makeSUT(complete: complete)) {
            $0.tagsEditor?.draft = ["банк"]
            $0.tagsEditor?.completion = ""
        }
        #expect(complete.payloads == [.init(entry: "к", draft: ["банк"], inUse: ["клиент"])])
        assert(state, .editTags(["банк"]), delivers: nil, using: makeSUT(complete: CompleteSpy("")))
    }

    @Test func typingSetsTheEntryAndItsCompletion() {
        let complete = CompleteSpy("иент")
        let state = makeState(editor: .init(id: "a", draft: ["банк"], inUse: ["клиент"]))
        assert(state, .typeTag("кл"), using: makeSUT(complete: complete)) {
            $0.tagsEditor?.entry = "кл"
            $0.tagsEditor?.completion = "иент"
        }
        #expect(complete.payloads == [.init(entry: "кл", draft: ["банк"], inUse: ["клиент"])])
        assert(state, .typeTag("кл"), delivers: nil, using: makeSUT(complete: CompleteSpy("иент")))
    }

    @Test func tabTakesTheCompletionIntoTheEntry() {
        let complete = CompleteSpy("")
        let state = makeState(editor: .init(id: "a", draft: [], entry: "кл", completion: "иент", inUse: ["клиент"]))
        assert(state, .completeTag, using: makeSUT(complete: complete)) {
            $0.tagsEditor?.entry = "клиент"
            $0.tagsEditor?.completion = ""
        }
        #expect(complete.payloads == [.init(entry: "клиент", draft: [], inUse: ["клиент"])])
        assert(state, .completeTag, delivers: nil, using: makeSUT(complete: CompleteSpy("")))
    }

    @Test func tabWithNoCompletionOrTypingWithNoEditorChangesNothing() {
        assert(makeState(editor: .init(id: "a", draft: [], entry: "зз")), .completeTag)
        assert(makeState(), .typeTag("кл"))
        assert(makeState(), .completeTag)
        assert(makeState(), .editTags(["банк"]))
    }

    @Test func returnSavesTheEntryAsTheLastTagAndClearsIt() {
        let normalize = Spy<[String], [String]> { _ in ["банк", "клиент"] }
        let state = makeState(editor: .init(id: "a", draft: ["банк"], entry: " клиент", completion: "", inUse: ["клиент"]))
        assert(state, .submitTags, using: makeSUT(normalize: normalize)) {
            $0.tagsEditor = .init(id: "a", draft: ["банк", "клиент"], pending: 1, inUse: ["клиент"])
            $0.tagsRequest = 1
            $0.requests = [.setTags(request: 1, id: "a", tags: ["банк", "клиент"])]
            $0.asked += 1
        }
        #expect(normalize.payloads == [["банк", " клиент"]])
        assert(state, .submitTags, delivers: [.setTags(request: 1, id: "a", tags: ["банк", "клиент"])],
               using: makeSUT(normalize: .init(transform: { _ in ["банк", "клиент"] })))
    }

    @Test func returnSubmitsTheNormalizedDraftUnderANewRequestID() {
        let normalize = Spy<[String], [String]> { _ in ["клиент", "банк"] }
        let sut = makeSUT(normalize: normalize)
        let state = makeState(editor: .init(id: "a", draft: [" клиент", "банк", "Клиент"]), tagsRequest: 4)
        assert(state, .submitTags, using: sut) {
            $0.tagsEditor?.draft = ["клиент", "банк"]
            $0.tagsEditor?.pending = 5
            $0.tagsRequest = 5
            $0.requests = [.setTags(request: 5, id: "a", tags: ["клиент", "банк"])]
            $0.asked += 1
        }
        #expect(normalize.payloads == [[" клиент", "банк", "Клиент", ""]])
        assert(state, .submitTags, delivers: [.setTags(request: 5, id: "a", tags: ["клиент", "банк"])], using: sut)
    }

    @Test func movingTheSelectionSubmitsTheDraftAndKeepsTheEditorForItsCall() {
        let state = makeState(selectedID: "a", editor: .init(id: "a", draft: ["банк"]))
        assert(state, .select("b")) {
            $0.selectedID = "b"
            $0.tagsEditor?.pending = 1
            $0.tagsRequest = 1
            $0.requests = [.setTags(request: 1, id: "a", tags: ["банк"])]
            $0.asked += 1
        }
        assert(state, .selectNext, delivers: [.setTags(request: 1, id: "a", tags: ["банк"])])
    }

    @Test func aPendingDraftIsNotSubmittedAgainByASelectionMove() {
        let state = makeState(selectedID: "a", editor: .init(id: "a", draft: ["банк"], pending: 1), tagsRequest: 1)
        assert(state, .select("b")) { $0.selectedID = "b" }
        assert(state, .select("b"), delivers: nil)
    }

    @Test func aSavedOutcomeOfThePendingRequestClosesTheEditor() {
        let state = makeState(editor: .init(id: "a", draft: ["банк"], pending: 3), tagsRequest: 3)
        assert(state, .tagsFinished(request: 3, .saved)) { $0.tagsEditor = nil }
    }

    @Test func aFailedSaveKeepsTheDraftAndShowsTheFailureForRetry() {
        let state = makeState(selectedID: "b", editor: .init(id: "a", draft: ["банк"], pending: 3), tagsRequest: 3)
        assert(state, .tagsFinished(request: 3, .failed("disk"))) {
            $0.tagsEditor = .init(id: "a", draft: ["банк"], failure: "disk")
        }
        let failed = makeState(editor: .init(id: "a", draft: ["банк"], failure: "disk"), tagsRequest: 3)
        assert(failed, .submitTags) {
            $0.tagsEditor = .init(id: "a", draft: ["банк"], pending: 4)
            $0.tagsRequest = 4
            $0.requests = [.setTags(request: 4, id: "a", tags: ["банк"])]
            $0.asked += 1
        }
    }

    @Test func aLateOutcomeOfAnEarlierAttemptIsIgnoredEvenForTheSameTags() {
        // Submitted A (1), then B (2), then A again (3): the first A's answer comes last.
        let state = makeState(editor: .init(id: "a", draft: ["A"], pending: 3), tagsRequest: 3)
        assert(state, .tagsFinished(request: 1, .saved))
        assert(state, .tagsFinished(request: 2, .failed("disk")))
    }

    @Test func editingAnotherCallIsUnavailableWhileASaveIsPending() {
        let state = makeState(editor: .init(id: "a", draft: ["банк"], pending: 2), tagsRequest: 2)
        assert(state, .beginTags("b", inUse: []))
        assert(state, .tagsFinished(request: 2, .failed("disk"))) {
            $0.tagsEditor = .init(id: "a", draft: ["банк"], failure: "disk")
        }
    }

    @Test func anotherCallCanBeEditedOnceNothingIsPending() {
        let state = makeState(editor: .init(id: "a", draft: ["банк"], failure: "disk"))
        assert(state, .beginTags("b", inUse: [])) { $0.tagsEditor = .init(id: "b", draft: []) }
    }

    @Test func escapeDropsADraftNotYetPending() {
        assert(makeState(editor: .init(id: "a", draft: ["банк"])), .cancelTags) { $0.tagsEditor = nil }
        assert(makeState(editor: .init(id: "a", draft: ["банк"], pending: 1)), .cancelTags)
    }

    @Test func aRenameAndADraftCommittedByOneMoveAreBothAsked() {
        let state = makeState(selectedID: "a", editing: .init(id: "a", title: "Новое"), editor: .init(id: "a", draft: ["банк"]))
        assert(state, .selectNext, delivers: [.rename(id: "a", title: "Новое"), .setTags(request: 1, id: "a", tags: ["банк"])])
    }
}

private final class Spy<Payload: Sendable, Answer: Sendable>: Sendable {
    private let recorded = Mutex<[Payload]>([])
    private let transform: @Sendable (Payload) -> Answer
    init(transform: @escaping @Sendable (Payload) -> Answer) { self.transform = transform }
    var payloads: [Payload] { recorded.withLock { $0 } }
    func call(_ payload: Payload) -> Answer {
        recorded.withLock { $0.append(payload) }
        return transform(payload)
    }
}

private struct Completing: Equatable, Sendable {
    var entry: String
    var draft: [String]
    var inUse: [String]
}

private typealias CompleteSpy = Spy<Completing, String>

private extension Spy where Payload == Completing, Answer == String {
    convenience init(_ answer: String) { self.init(transform: { _ in answer }) }
}

private func makeSUT(normalize: Spy<[String], [String]> = .init(transform: { $0.filter { !$0.isEmpty } }),
                     complete: CompleteSpy? = nil) -> CallsListReducer {
    CallsListReducer(splitQuery: { _ in
        Issue.record("The query is not split while editing tags")
        return ([], "")
    }, tagKey: { _ in
        Issue.record("No tag is compared while editing tags")
        return ""
    }, normalizeTags: { normalize.call($0) }, complete: { entry, draft, inUse in
        guard let complete else {
            Issue.record("No tag is completed for this event")
            return ""
        }
        return complete.call(.init(entry: entry, draft: draft, inUse: inUse))
    })
}

private func row(_ id: String, editable: Bool = true) -> CallsListMachineState.Row {
    .init(id: id, title: id, editable: editable, tags: id == "a" ? ["клиент"] : [])
}

private func makeState(rows: [CallsListMachineState.Row] = [row("a"), row("b")], busy: Bool = false,
                       selectedID: String? = nil, editing: CallsListMachineState.Editing? = nil,
                       editor: CallsListMachineState.TagsEditor? = nil, tagsRequest: Int = 0) -> CallsListMachineState {
    .init(rows: rows, busy: busy, selectedID: selectedID, editing: editing, tagsEditor: editor, tagsRequest: tagsRequest)
}

private func assert(_ state: CallsListMachineState, _ event: CallsListMachineEvent, using sut: CallsListReducer = makeSUT(),
                    sourceLocation: SourceLocation = #_sourceLocation,
                    mutation: (inout CallsListMachineState) -> Void = { _ in }) {
    var expected = state
    mutation(&expected)
    #expect(sut.reduce(state, event) == expected, sourceLocation: sourceLocation)
}

private func assert(_ state: CallsListMachineState, _ event: CallsListMachineEvent, delivers requests: [CallsListMachineState.Request]?,
                    using sut: CallsListReducer = makeSUT(), sourceLocation: SourceLocation = #_sourceLocation) {
    let next = sut.reduce(state, event)
    #expect((next.asked > state.asked ? next.requests : nil) == requests, sourceLocation: sourceLocation)
}
