import Foundation

/// The list's named states, drawn by the Xcode previews and compared with
/// reference images by the tests.
public enum CallsListPreviews {
    public static let states = states(in: CallsListText(language: .russian))

    /// The named states with their text in the given language.
    public static func states(in text: CallsListText) -> [(name: String, state: CallsListState)] {
        let words = Words(text)
        let sample = sample(words), notes = notes(words)
        return [
            ("calls", sample),
            ("notes", notes),
            ("summary", with(sample) {
                $0.rows[0].summary = .pending
                $0.rows[0].summaryStatus = text(.summaryRunning)
                $0.rows[1].summary = .failed
                $0.rows[1].summaryStatus = text(.summaryInterrupted)
                $0.rows[1].canRetrySummary = true
            }),
            ("summary-failed-banner", with(sample) {
                $0.rows[1].summary = .failed
                $0.rows[1].canRetrySummary = true
                $0.failure = text(.summaryRetryFailed)
            }),
            ("long-title", with(notes) {
                $0.rows[1] = .init(id: "2026.10.20-1600", title: words.long, displayTitle: words.long, day: .init(title: text(.yesterday), count: words.one),
                                   time: "16:00", duration: "1:12:40", editable: true, hasNotes: true)
            }),
            ("older-year", with(sample) {
                $0.rows[2] = .init(id: "2025.12.12-1030", title: words.retro, displayTitle: words.retro,
                                   day: .init(title: words.olderDay, count: words.one), time: "10:30", duration: "1:05:12", editable: true)
            }),
            ("notes-selected", with(notes) { $0.selectedID = $0.rows[1].id }),
            ("delete", with(sample) {
                $0.deleteID = $0.rows[0].id
                $0.deleteBody = text(.deleteBody, "2026.10.21-1230 " + words.launch)
            }),
            ("empty", CallsListState()),
            ("loading", CallsListState(busy: true)),
            ("rename", with(sample) { $0.editing = .init(id: $0.rows[0].id, title: $0.rows[0].title) }),
            ("search", search(words, text, searching: false)),
            ("searching", with(search(words, text, searching: true)) { $0.rows.removeLast() }),
            ("search-none", CallsListState(search: .init(query: "Kubernetes", searching: false), searchText: "Kubernetes")),
        ]
    }

    public static func state(_ name: String, in text: CallsListText = .init(language: .russian)) -> CallsListState {
        states(in: text).first { $0.name == name }!.state
    }

    /// The sample calls' titles and day headers in the list's language.
    private struct Words {
        let launch, okr, retro, long, friday, olderDay, one, today, yesterday, launchGist, okrGist, untitledGist: String
        init(_ text: CallsListText) {
            let english = text.language == .english
            launch = english ? "Launch: roles and SLA" : "Запуск: роли и SLA"
            okr = english ? "Quarterly OKR sync" : "Синк по OKR на квартал"
            retro = english ? "Year in review" : "Ретро за год"
            launchGist = english ? "Who owns the launch and which SLA we promise to the first customers."
                : "Кто отвечает за запуск и какой SLA обещаем первым клиентам."
            okrGist = english ? "Key results for the quarter, aligned before Friday." : "Ключевые результаты квартала сверяем до пятницы."
            untitledGist = english ? "A short check on the build." : "Короткая сверка по сборке."
            long = english ? "Interview: iOS candidate — technical part, architecture, tests and questions on Swift Concurrency and SwiftUI"
                : "Интервью: кандидат на iOS — техническая часть, архитектура, тесты и вопросы по Swift Concurrency и SwiftUI"
            friday = english ? "Friday, October 17" : "Пятница, 17 октября"
            olderDay = english ? "December 12, 2025" : "12 декабря 2025"
            one = text(.callsOne, 1)
            today = text(.today)
            yesterday = text(.yesterday)
        }
    }

    private static func sample(_ words: Words) -> CallsListState {
        .init(rows: [
            .init(id: "2026.10.21-1230", title: words.launch, displayTitle: words.launch, day: .init(title: words.today, count: words.one), time: "12:30", duration: "47:00", editable: true),
            .init(id: "2026.10.20-1600", title: words.okr, displayTitle: words.okr, day: .init(title: words.yesterday, count: words.one), time: "16:00", duration: "1:12:00", editable: true),
            .init(id: "2026.10.17-1100", title: "", displayTitle: "2026.10.17-1100", day: .init(title: words.friday, count: words.one), time: "11:00", duration: "—", editable: true),
        ])
    }

    /// A call with notes above one without, and another with notes below.
    private static func notes(_ words: Words) -> CallsListState {
        with(sample(words)) {
            $0.rows[0].hasNotes = true; $0.rows[0].gist = words.launchGist
            $0.rows[2].hasNotes = true; $0.rows[2].gist = words.untitledGist
        }
    }

    /// «OKR» found in one call's title, another's transcript and a third's notes.
    private static func search(_ words: Words, _ text: CallsListText, searching: Bool) -> CallsListState {
        let english = text.language == .english
        var state = notes(words)
        state.searchText = "OKR"
        state.search = .init(query: "OKR", searching: searching)
        state.selectedID = state.rows[1].id
        state.rows[0].match = .init(title: [], snippet: .init(
            place: "12:04", placeIsTime: true,
            text: english ? "…then we move the OKR review to Thursday and keep the SLA as it is…"
                : "…тогда переносим ревью OKR на четверг и SLA оставляем как есть…",
            hits: [english ? 18 : 23].map { $0..<($0 + 3) }, more: text(.searchMore, 2)))
        let okr = state.rows[1].displayTitle
        let start = okr.distance(from: okr.startIndex, to: okr.range(of: "OKR")!.lowerBound)
        state.rows[1].hasNotes = true; state.rows[1].gist = words.okrGist
        state.rows[1].match = .init(title: [start..<(start + 3)], snippet: nil)
        state.rows[2].match = .init(title: [], snippet: .init(
            place: text(.searchNotes), placeIsTime: false,
            text: english ? "Agreed to align the OKR wording before the review…" : "Договорились сверить формулировки OKR до ревью…",
            hits: [english ? 20 : 34].map { $0..<($0 + 3) }, more: nil))
        return state
    }

    private static func with(_ state: CallsListState, _ change: (inout CallsListState) -> Void) -> CallsListState {
        var state = state
        change(&state)
        return state
    }
}
