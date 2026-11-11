@testable import SummaryPreviewUI
import Testing

struct SummaryPreviewTextTests {

    @Test func everyKeyHasRussianAndEnglishText() {

        let russian = SummaryPreviewText(language: .russian), english = SummaryPreviewText(language: .english)
        for key in SummaryPreviewPhrase.allCases.map(\.rawValue) {
            #expect(russian(key) != key, "\(key) has no Russian text")
            #expect(english(key) != key, "\(key) has no English text")
            #expect(!english(key).contains(where: { ("а"..."я").contains($0) || ("А"..."Я").contains($0) }), "\(key) is not translated")
        }
    }
}
