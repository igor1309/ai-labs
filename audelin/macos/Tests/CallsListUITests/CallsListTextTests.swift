@testable import CallsListUI
import Testing

struct CallsListTextTests {

    @Test func everyKeyHasRussianAndEnglishText() {

        let russian = CallsListText(language: .russian), english = CallsListText(language: .english)
        for key in CallsListPhrase.allCases.map(\.rawValue) {
            #expect(russian(key) != key, "\(key) has no Russian text")
            #expect(english(key) != key, "\(key) has no English text")
            #expect(!english(key).contains(where: { ("а"..."я").contains($0) || ("А"..."Я").contains($0) }), "\(key) is not translated")
        }
    }
}
