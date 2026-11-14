import CallsListUI
import SummaryJobs
import Testing
@testable import Composer

struct SummaryStatusTextTests {

    @Test func aStatusIsWrittenInTheListLanguage() {
        let english = CallsListText(language: .english), russian = CallsListText(language: .russian)
        #expect(english.summariesStatus(.noting, false) == "Writing the summary…")
        #expect(english.summariesStatus(.succeeded, true) == "The summary is ready; names not identified")
        #expect(russian.summariesStatus(.succeeded, false) == "Итоги готовы")
        #expect(russian.summariesStatus(.interrupted, false) == "Подготовка итогов прервана; автоматического повтора не будет.")
    }
}
