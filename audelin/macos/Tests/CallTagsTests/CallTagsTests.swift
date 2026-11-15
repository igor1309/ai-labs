import CallTags
import Testing

@Suite(.timeLimit(.minutes(1)))
struct CallTagsTests {

    @Test func tagsDifferingInCaseOrYoAreOneKeptAsFirstWritten() {
        #expect(CallTags.normalized(["Клиент", "клиент", "ёж", "еж", "ЕЖ"]) == ["Клиент", "ёж"])
        #expect(CallTags.key("Ёж") == CallTags.key("еж"))
    }

    @Test func tagsAreTrimmedAndEmptyOnesDropped() {
        #expect(CallTags.normalized(["  клиент ", "", "   ", "\tбанк\n"]) == ["клиент", "банк"])
    }

    @Test func aQuerySplitsIntoHashTagsAndText() {
        #expect(CallTags.query("#клиент бюджет") == .init(tags: ["клиент"], text: "бюджет"))
        #expect(CallTags.query("план #Клиент  на #банк #клиент год") == .init(tags: ["Клиент", "банк"], text: "план на год"))
    }

    @Test func aLoneHashIsText() {
        #expect(CallTags.query("# итоги") == .init(tags: [], text: "# итоги"))
    }

    @Test func oneChosenTagKeepsTheCallsHavingIt() {
        let calls = [("a", ["клиент"]), ("b", ["Клиент", "банк"]), ("c", ["найм"])]
        #expect(CallTags.keep(calls, having: ["клиент"], tags: \.1).map(\.0) == ["a", "b"])
    }

    @Test func twoChosenTagsKeepOnlyCallsHavingBoth() {
        let calls = [("a", ["клиент"]), ("b", ["клиент", "банк"]), ("c", ["банк"])]
        #expect(CallTags.keep(calls, having: ["клиент", "БАНК"], tags: \.1).map(\.0) == ["b"])
    }

    @Test func noChosenTagKeepsEveryCall() {
        let calls = [("a", [String]()), ("b", ["банк"])]
        #expect(CallTags.keep(calls, having: [], tags: \.1).map(\.0) == ["a", "b"])
    }

    @Test func tagsInUseAreMostUsedFirstShownAsFirstWritten() {
        #expect(CallTags.inUse([["найм", "Клиент"], ["клиент"], ["банк", "клиент"], ["банк"]]) == ["Клиент", "банк", "найм"])
    }

    @Test func noTagsMeansNoneInUse() {
        #expect(CallTags.inUse([[], []]).isEmpty)
    }
}
