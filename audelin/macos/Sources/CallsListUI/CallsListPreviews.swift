import Foundation

/// The list's named states, drawn by the Xcode previews and compared with
/// reference images by the tests.
public enum CallsListPreviews {
    public static let states = states(in: CallsListText(language: .russian))

    /// The named states with their text in the given language.
    public static func states(in text: CallsListText) -> [(name: String, state: CallsListState)] {
        let english = text.language == .english
        let interrupted = english ? "Preparing the notes stopped; it won’t be retried automatically."
            : "Подготовка итогов прервана; автоматического повтора не будет."
        let sample = sample(text), notes = notes(text)
        return [
        ("calls", sample),
        ("notes", notes),
        ("summary-retry", with(sample) {
            $0.rows[1].summaryStatus = interrupted
            $0.rows[1].canRetrySummary = true
        }),
        ("summary-retry-failed", with(sample) {
            $0.rows[1].summaryStatus = interrupted
            $0.rows[1].canRetrySummary = true
            $0.failure = english ? "Couldn’t retry the notes. The transcript and the earlier notes are kept."
                : "Не удалось повторить подготовку итогов. Расшифровка и прежние итоги сохранены."
        }),
        ("notes-selected", with(notes) { $0.selectedID = $0.rows[1].id }),
        ("notes-previewed", with(notes) { $0.selectedID = $0.rows[2].id; $0.previewedID = $0.rows[2].id }),
        ("delete", with(sample) { $0.deleteID = $0.rows[0].id }),
        ("rename", with(sample) { $0.editing = .init(id: $0.rows[0].id, title: $0.rows[0].title) }),
        ]
    }

    public static func state(_ name: String, in text: CallsListText = .init(language: .russian)) -> CallsListState {
        states(in: text).first { $0.name == name }!.state
    }

    private static func sample(_ text: CallsListText) -> CallsListState {
        let start = { ISO8601DateFormatter().date(from: $0)! }
        let english = text.language == .english
        return .init(rows: [
            .init(id: "2026.10.21-1230", title: english ? "Launch: roles and SLA" : "Запуск: роли и SLA", start: start("2026-10-21T12:30:00Z"), duration: 2_820, timeZone: .gmt, text: text, editable: true),
            .init(id: "2026.10.20-1600", title: english ? "Quarterly OKR sync" : "Синк по OKR на квартал", start: start("2026-10-20T16:00:00Z"), duration: 4_320, timeZone: .gmt, text: text, editable: true),
            .init(id: "2026.10.17-1100", title: "", start: start("2026-10-17T11:00:00Z"), duration: nil, timeZone: .gmt, text: text, editable: true),
        ])
    }

    /// A call with notes above one without, and another with notes below.
    private static func notes(_ text: CallsListText) -> CallsListState {
        with(sample(text)) { $0.rows[0].hasNotes = true; $0.rows[2].hasNotes = true }
    }

    private static func with(_ state: CallsListState, _ change: (inout CallsListState) -> Void) -> CallsListState {
        var state = state
        change(&state)
        return state
    }
}
