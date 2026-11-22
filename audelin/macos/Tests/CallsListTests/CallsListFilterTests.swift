import CallsList
import Synchronization
import Testing

struct CallsListFilterTests {
    @Test func searchKeepsTheQueryAndSplitsItsTagsFromItsText() {
        let split = QuerySpy(answer: (tags: ["клиент"], text: "бюджет"))
        let sut = makeSUT(split: split)
        assert(sut, makeState(), .search("#клиент бюджет")) {
            $0.query = "#клиент бюджет"
            $0.filterTags = ["клиент"]
            $0.searchText = "бюджет"
        }
        #expect(split.payloads == ["#клиент бюджет"])
    }

    @Test func choosingATagAddsItToTheFilter() {
        let split = QuerySpy(answer: (tags: [String](), text: "план"))
        let sut = makeSUT(split: split)
        assert(sut, makeState(query: "план", searchText: "план"), .toggleTag("клиент")) {
            $0.chosenTags = ["клиент"]
            $0.filterTags = ["клиент"]
        }
        #expect(split.payloads == ["план"])
    }

    @Test func choosingASecondTagKeepsBoth() {
        let sut = makeSUT(split: QuerySpy(answer: (tags: [], text: "")))
        assert(sut, makeState(chosenTags: ["клиент"], filterTags: ["клиент"]), .toggleTag("банк")) {
            $0.chosenTags = ["клиент", "банк"]
            $0.filterTags = ["клиент", "банк"]
        }
    }

    @Test func choosingAChosenTagInOtherCaseUnchoosesIt() {
        let keys = Spy<String, String>(transform: { $0.lowercased() })
        let sut = makeSUT(split: QuerySpy(answer: (tags: [], text: "")), key: keys)
        assert(sut, makeState(chosenTags: ["Клиент", "банк"], filterTags: ["Клиент", "банк"]), .toggleTag("клиент")) {
            $0.chosenTags = ["банк"]
            $0.filterTags = ["банк"]
        }
        #expect(keys.payloads.prefix(2) == ["клиент", "Клиент"])
    }

    @Test func aTagBothChosenAndTypedFiltersOnce() {
        let sut = makeSUT(split: QuerySpy(answer: (tags: ["клиент"], text: "")))
        assert(sut, makeState(chosenTags: ["Клиент"], filterTags: ["Клиент"]), .search("#клиент")) {
            $0.query = "#клиент"
            $0.filterTags = ["Клиент"]
        }
    }

    @Test func showingTheWindowAgainResetsTheQueryAndChosenTags() {
        let sut = makeSUT(split: QuerySpy(answer: (tags: [], text: "")))
        assert(sut, makeState(query: "#банк план", chosenTags: ["клиент"], filterTags: ["клиент", "банк"], searchText: "план"), .shown) {
            $0.query = ""
            $0.chosenTags = []
            $0.filterTags = []
            $0.searchText = ""
        }
    }

    @Test func rowsCarryTheirTagsWithoutFiltering() {
        let sut = makeSUT(split: QuerySpy(answer: (tags: [], text: "")))
        let rows = [CallsListMachineState.Row(id: "a", title: "A", editable: true, tags: ["клиент"])]
        assert(sut, makeState(filterTags: ["банк"]), .rowsChanged(rows, busy: false)) { $0.rows = rows }
    }
}

private typealias QuerySpy = Spy<String, (tags: [String], text: String)>

private final class Spy<Payload: Sendable, Answer: Sendable>: Sendable {
    private let recorded = Mutex<[Payload]>([])
    private let transform: @Sendable (Payload) -> Answer
    init(answer: Answer) { transform = { _ in answer } }
    init(transform: @escaping @Sendable (Payload) -> Answer) { self.transform = transform }
    var payloads: [Payload] { recorded.withLock { $0 } }
    func call(_ payload: Payload) -> Answer {
        recorded.withLock { $0.append(payload) }
        return transform(payload)
    }
}

private func makeSUT(split: Spy<String, (tags: [String], text: String)>,
                     key: Spy<String, String> = .init(transform: { $0.lowercased() })) -> CallsListReducer {
    CallsListReducer(splitQuery: { split.call($0) }, tagKey: { key.call($0) }, normalizeTags: { _ in
        Issue.record("No tags are saved while filtering")
        return []
    }, complete: { _, _, _ in
        Issue.record("No tag is completed while filtering")
        return ""
    })
}

private func makeState(query: String = "", chosenTags: [String] = [], filterTags: [String] = [],
                       searchText: String = "") -> CallsListMachineState {
    .init(rows: [.init(id: "a", title: "A", editable: true)], query: query, chosenTags: chosenTags,
          filterTags: filterTags, searchText: searchText)
}

private func assert(_ sut: CallsListReducer, _ state: CallsListMachineState, _ event: CallsListMachineEvent,
                    sourceLocation: SourceLocation = #_sourceLocation,
                    mutation: (inout CallsListMachineState) -> Void = { _ in }) {
    var expected = state
    mutation(&expected)
    let next = sut.reduce(state, event)
    #expect(next == expected, sourceLocation: sourceLocation)
    #expect(next.asked == state.asked, sourceLocation: sourceLocation)
}
