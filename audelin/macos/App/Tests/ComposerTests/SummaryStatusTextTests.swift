import CallsListUI
import SummaryJobs
import Testing
@testable import Composer

struct SummaryStatusTextTests {

    @Test func aStatusIsWrittenInTheListLanguage() {
        let english = CallsListText(language: .english), russian = CallsListText(language: .russian)
        #expect(english.summaryStatus(.idle, false) == "")
        #expect(english.summaryStatus(.running, false) == "Writing the summary…")
        #expect(english.summaryStatus(.succeeded, true) == "The summary is ready; names not identified")
        #expect(russian.summaryStatus(.succeeded, false) == "Итоги готовы")
        #expect(russian.summaryStatus(.interrupted, false) == "Подготовка итогов прервана; автоматического повтора не будет.")
    }
}
