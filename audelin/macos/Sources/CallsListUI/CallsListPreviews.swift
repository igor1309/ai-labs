import Foundation

/// The list's named states, drawn by the Xcode previews and compared with
/// reference images by the tests.
public enum CallsListPreviews {
    public static let states: [(name: String, state: CallsListState)] = [
        ("calls", sample),
        ("notes", notes),
        ("notes-selected", with(notes) { $0.selectedID = $0.rows[1].id }),
        ("notes-previewed", with(notes) { $0.selectedID = $0.rows[2].id; $0.previewedID = $0.rows[2].id }),
        ("delete", with(sample) { $0.deleteID = $0.rows[0].id }),
        ("rename", with(sample) { $0.editing = .init(id: $0.rows[0].id, title: $0.rows[0].title) }),
    ]

    public static func state(_ name: String) -> CallsListState {
        states.first { $0.name == name }!.state
    }

    private static var sample: CallsListState {
        let start = { ISO8601DateFormatter().date(from: $0)! }
        return .init(rows: [
            .init(id: "2026.10.21-1230", title: "Запуск: роли и SLA", start: start("2026-10-21T12:30:00Z"), duration: 2_820, timeZone: .gmt, editable: true),
            .init(id: "2026.10.20-1600", title: "Синк по OKR на квартал", start: start("2026-10-20T16:00:00Z"), duration: 4_320, timeZone: .gmt, editable: true),
            .init(id: "2026.10.17-1100", title: "", start: start("2026-10-17T11:00:00Z"), duration: nil, timeZone: .gmt, editable: true),
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
