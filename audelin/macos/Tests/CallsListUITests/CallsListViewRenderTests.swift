import CallsListUI
import RenderedText
import SwiftUI
import Testing

@MainActor
struct CallsListViewRenderTests {

    @Test func renamingPutsTheTitleInAFieldOnThatRowOnly() {

        var state = makeState()
        state.editing = .init(id: state.rows[1].id, title: "Новое название")

        #expect(Offscreen.textFields(in: Offscreen.host(view(state), size: size)).map(\.stringValue) == ["Новое название"])
        #expect(Offscreen.textFields(in: Offscreen.host(view(makeState()), size: size)).isEmpty)
    }

    // MARK: - Helpers

    private let size = CGSize(width: 920, height: 420)

    private func view(_ state: CallsListState) -> some View {

        CallsListView(state: state, event: { _ in }).environment(\.colorScheme, .light)
    }

    private func makeState() -> CallsListState {

        let start = { ISO8601DateFormatter().date(from: $0)! }
        return CallsListState(rows: [
            .init(id: "2026.10.21-1230", title: "Запуск", start: start("2026-10-21T12:30:00Z"), duration: 2_820, timeZone: .gmt, text: .init(language: .russian), editable: true),
            .init(id: "2026.10.20-1600", title: "Синк по OKR", start: start("2026-10-20T16:00:00Z"), duration: 4_320, timeZone: .gmt, text: .init(language: .russian), editable: true),
            .init(id: "2026.10.17-1100", title: "", start: start("2026-10-17T11:00:00Z"), duration: nil, timeZone: .gmt, text: .init(language: .russian), editable: true),
        ])
    }
}
