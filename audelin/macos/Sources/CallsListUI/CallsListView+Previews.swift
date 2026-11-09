import SwiftUI

private var sample: CallsListState {
    .init(rows: [
        .init(id: "2026.10.21-1230", title: "Запуск: роли и SLA", start: ISO8601DateFormatter().date(from: "2026-10-21T12:30:00Z")!, duration: 2_820, timeZone: .gmt, editable: true),
        .init(id: "2026.10.20-1600", title: "Синк по OKR на квартал", start: ISO8601DateFormatter().date(from: "2026-10-20T16:00:00Z")!, duration: 4_320, timeZone: .gmt, editable: true),
        .init(id: "2026.10.17-1100", title: "", start: ISO8601DateFormatter().date(from: "2026-10-17T11:00:00Z")!, duration: nil, timeZone: .gmt, editable: true),
    ])
}

#Preview("Calls · Light") { CallsListView(state: sample, event: { _ in }).frame(width: 920, height: 420).preferredColorScheme(.light) }
#Preview("Calls · Dark") { CallsListView(state: sample, event: { _ in }).frame(width: 920, height: 420).preferredColorScheme(.dark) }
#Preview("Delete") {
    var state = sample
    state.deleteID = state.rows[0].id
    return CallsListView(state: state, event: { _ in }).frame(width: 920, height: 420)
}
#Preview("Rename") {
    var state = sample
    state.editing = .init(id: state.rows[0].id, title: state.rows[0].title)
    return CallsListView(state: state, event: { _ in }).frame(width: 920, height: 420)
}
