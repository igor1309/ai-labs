import CallsSearch
import Testing

@Suite(.timeLimit(.minutes(1)))
struct CallsSearchTests {
    private typealias Line = CallsSearch.Line

    @Test(arguments: ["", "   ", "\n"])
    func aBlankQueryMatchesNothing(query: String) {
        #expect(CallsSearch.match(query, title: "Синк", tags: [], transcript: [.init(start: 0, words: "Синк")], notes: "Синк") == nil)
    }

    @Test func aCallWithoutTheQueryDoesNotMatch() {
        #expect(CallsSearch.match("бюджет", title: "Синк по OKR", tags: [], transcript: [.init(start: 3, words: "про сроки")], notes: "Итоги") == nil)
    }

    @Test func titleMatchesIgnoreCaseAndYo() {
        let match = CallsSearch.match("ЁЛКА okr", title: "елка OKR и Ёлка okr", tags: [], transcript: [], notes: nil)
        #expect(match == .init(title: [0..<8, 11..<19], snippet: nil))
    }

    @Test func theFirstTranscriptMatchIsShownWithItsTimeAndTheRestAreCounted() {
        let match = CallsSearch.match("okr", title: "Синк", tags: [], transcript: [
            .init(start: 5, words: "начнём"),
            .init(start: 872, words: "итак, по OKR второго квартала и ещё раз OKR"),
            .init(start: 900, words: "OKR"),
        ], notes: "## Итоги\n\n- **OKR** закрыты")
        #expect(match == .init(title: [], snippet: .init(place: .transcript(872), text: "итак, по OKR второго квартала и ещё раз OKR", hits: [9..<12, 40..<43], more: 3)))
    }

    @Test func notesMatchAsPlainTextWhenTheTranscriptDoesNot() {
        let match = CallsSearch.match("okr", title: "Ретро", tags: [], transcript: [.init(start: 1, words: "привет")], notes: "<!-- audelin-summary:okr -->\n# Итоги\n\n- из пяти **OKR** года")
        #expect(match == .init(title: [], snippet: .init(place: .notes, text: "Итоги из пяти OKR года", hits: [14..<17], more: 0)))
    }

    @Test func aLongLineIsCutAtWordsAroundTheMatch() throws {
        let before = Array(repeating: "слово", count: 10).joined(separator: " ")
        let after = Array(repeating: "дальше", count: 30).joined(separator: " ")
        let snippet = try #require(CallsSearch.match("OKR", title: "", tags: [], transcript: [.init(start: 0, words: before + " OKR " + after)], notes: nil)?.snippet)
        #expect(snippet.text.hasPrefix("…слово слово слово OKR дальше"))
        #expect(snippet.text.hasSuffix("дальше…"))
        let hit = try #require(snippet.hits.first)
        #expect(String(Array(snippet.text)[hit]) == "OKR")
        #expect(snippet.hits == [19..<22])
    }

    @Test func aCallMatchedOnlyByItsTagHasATagMatchAndNoTitleRanges() {
        let match = CallsSearch.match("бюджет", title: "Синк по OKR", tags: ["клиент", "Бюджет"], transcript: [], notes: nil)
        #expect(match == .init(title: [], tags: [1], snippet: nil))
    }

    @Test func tagMatchesIgnoreCaseAndYoAndAreReportedApartFromTitle() {
        let match = CallsSearch.match("ёж", title: "про ежа", tags: ["Ежи", "банк", "ёжик"], transcript: [], notes: nil)
        #expect(match == .init(title: [4..<6], tags: [0, 2], snippet: nil))
    }

    @Test func aPhraseDoesNotSpanTitleAndTag() {
        #expect(CallsSearch.match("okr клиент", title: "Синк OKR", tags: ["клиент"], transcript: [], notes: nil) == nil)
    }
}
