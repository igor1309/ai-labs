import Foundation

/// The list's named states, drawn by the Xcode previews and compared with
/// reference images by the tests.
public enum CallsListPreviews {
    public static let states: [(name: String, state: CallsListState)] = [
        ("calls", sample),
        ("notes", notes),
        ("summary", with(sample) {
            $0.rows[0].summary = .pending
            $0.rows[0].summaryStatus = "Готовятся итоги"
            $0.rows[1].summary = .failed
            $0.rows[1].summaryStatus = "Подготовка итогов прервана; автоматического повтора не будет."
            $0.rows[1].canRetrySummary = true
        }),
        ("summary-failed-banner", with(sample) {
            $0.rows[1].summary = .failed
            $0.rows[1].canRetrySummary = true
            $0.failure = "Не удалось повторить подготовку итогов. Расшифровка и прежние итоги сохранены."
        }),
        ("long-title", with(notes) {
            $0.rows[1] = .init(id: "2026.10.20-1600", title: long, displayTitle: long, day: .init(title: "Вчера", count: "1 звонок"),
                               time: "16:00", duration: "1:12:40", editable: true, hasNotes: true)
        }),
        ("older-year", with(sample) {
            $0.rows[2] = .init(id: "2025.12.12-1030", title: "Ретро за год", displayTitle: "Ретро за год",
                               day: .init(title: "12 декабря 2025", count: "1 звонок"), time: "10:30", duration: "1:05:12", editable: true)
        }),
        ("notes-selected", with(notes) { $0.selectedID = $0.rows[1].id }),
        ("notes-previewed", with(notes) { $0.selectedID = $0.rows[2].id; $0.previewedID = $0.rows[2].id }),
        ("delete", with(sample) {
            $0.deleteID = $0.rows[0].id
            $0.deleteBody = "«2026.10.21-1230 Запуск: роли и SLA»: удалится вся папка звонка — аудио, расшифровки и саммари. Отменить нельзя."
        }),
        ("empty", CallsListState()),
        ("loading", CallsListState(busy: true)),
        ("rename", with(sample) { $0.editing = .init(id: $0.rows[0].id, title: $0.rows[0].title) }),
    ]

    public static func state(_ name: String) -> CallsListState {
        states.first { $0.name == name }!.state
    }

    private static let long = "Интервью: кандидат на iOS — техническая часть, архитектура, тесты и вопросы по Swift Concurrency и SwiftUI"

    private static var sample: CallsListState {
        .init(rows: [
            .init(id: "2026.10.21-1230", title: "Запуск: роли и SLA", displayTitle: "Запуск: роли и SLA", day: .init(title: "Сегодня", count: "1 звонок"), time: "12:30", duration: "47:00", editable: true),
            .init(id: "2026.10.20-1600", title: "Синк по OKR на квартал", displayTitle: "Синк по OKR на квартал", day: .init(title: "Вчера", count: "1 звонок"), time: "16:00", duration: "1:12:00", editable: true),
            .init(id: "2026.10.17-1100", title: "", displayTitle: "2026.10.17-1100", day: .init(title: "Пятница, 17 октября", count: "1 звонок"), time: "11:00", duration: "—", editable: true),
        ])
    }

    /// A call with notes above one without, and another with notes below.
    private static var notes: CallsListState {
        with(sample) { $0.rows[0].hasNotes = true; $0.rows[2].hasNotes = true }
    }

    private static func with(_ state: CallsListState, _ change: (inout CallsListState) -> Void) -> CallsListState {
        var state = state
        change(&state)
        return state
    }
}
