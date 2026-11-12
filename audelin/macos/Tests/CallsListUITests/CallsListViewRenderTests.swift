import AppKit
import CallsListUI
import RenderedText
import SwiftUI
import Testing

@MainActor
struct CallsListViewRenderTests {

    @Test func renamingPutsTheTitleInAFieldOnThatRowOnly() {

        var state = makeState()
        state.editing = .init(id: state.rows[1].id, title: "Новое название")

        #expect(Offscreen.textFields(in: Offscreen.host(view(state), size: size)).filter { !($0 is NSSearchField) }.map(\.stringValue) == ["Новое название"])
        #expect(Offscreen.textFields(in: Offscreen.host(view(makeState()), size: size)).filter { !($0 is NSSearchField) }.isEmpty)
    }

    // MARK: - Helpers

    private let size = CGSize(width: 920, height: 420)

    private func view(_ state: CallsListState) -> some View {

        CallsListView(state: state, text: .init(language: .russian), event: { _ in }).environment(\.colorScheme, .light)
    }

    private func makeState() -> CallsListState {

        return CallsListState(rows: [
            .init(id: "2026.10.21-1230", title: "Запуск", displayTitle: "Запуск", day: .init(title: "Сегодня", count: "1 звонок"), time: "12:30", duration: "47:00", editable: true),
            .init(id: "2026.10.20-1600", title: "Синк по OKR", displayTitle: "Синк по OKR", day: .init(title: "Вчера", count: "1 звонок"), time: "16:00", duration: "1:12:00", editable: true),
            .init(id: "2026.10.17-1100", title: "", displayTitle: "2026.10.17-1100", day: .init(title: "Пятница, 17 октября", count: "1 звонок"), time: "11:00", duration: "—", editable: true),
        ])
    }
}
