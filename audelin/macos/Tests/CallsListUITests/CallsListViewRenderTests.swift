import BlockingTestWork
import CallsListUI
import RenderedText
import SwiftUI
import Testing

@MainActor
struct CallsListViewRenderTests {

    @Test(arguments: [ColorScheme.light, .dark])
    func rowsShowDateTitleAndDuration(scheme: ColorScheme) async throws {

        let text = try await rendered(makeState(), scheme)

        #expect(text.shows("Дата"), "\(text)")
        #expect(text.shows("21.10 · 12:30"), "\(text)")
        #expect(text.shows("Запуск"), "\(text)")
        #expect(text.shows("47 мин"), "\(text)")
        #expect(text.shows("1 ч 12 мин"), "\(text)")
        #expect(text.shows("2026.10.17-1100"), "an untitled call shows its time: \(text)")
        #expect(text.lines.contains { ["—", "–", "-"].contains($0) }, "an unknown duration shows a dash: \(text)")
        #expect(!text.shows("Удалить звонок"), "\(text)")
        #expect(!text.shows("Открыть"), "row actions wait for the pointer: \(text)")
    }

    @Test func noRowsSaysWhetherCallsAreLoading() async throws {

        let empty = try await rendered(CallsListState(), .light)
        #expect(empty.shows("Пока нет записанных звонков"), "\(empty)")
        #expect(!empty.shows("Загружаются"), "\(empty)")

        let loading = try await rendered(CallsListState(busy: true), .light)
        #expect(loading.shows("Загружаются звонки"), "\(loading)")
        #expect(!loading.shows("Пока нет"), "\(loading)")
    }

    @Test func renamingPutsTheTitleInAFieldOnThatRowOnly() async throws {

        var state = makeState()
        state.editing = .init(id: state.rows[1].id, title: "Новое название")
        let host = Offscreen.host(view(state, .light), size: size)

        #expect(Offscreen.textFields(in: host).map(\.stringValue) == ["Новое название"])
        let text = try await read(host)
        #expect(text.shows("2026.10.20-1600"), "the folder's fixed part stays beside the field: \(text)")
        #expect(text.shows("Запуск"), "\(text)")
        #expect(!text.shows("Синк по OKR"), "\(text)")

        #expect(Offscreen.textFields(in: Offscreen.host(view(makeState(), .light), size: size)).isEmpty)
    }

    @Test(arguments: [ColorScheme.light, .dark])
    func deleteConfirmationNamesTheCall(scheme: ColorScheme) async throws {

        var state = makeState()
        state.deleteID = state.rows[0].id
        let text = try await rendered(state, scheme)

        #expect(text.shows("Удалить звонок?"), "\(text)")
        #expect(text.shows("2026.10.21-1230 Запуск"), "\(text)")
        #expect(text.shows("Отменить нельзя"), "\(text)")
        #expect(text.shows("Отмена"), "\(text)")
    }

    @Test(arguments: [ColorScheme.light, .dark])
    func failureIsShownOnlyWhenThereIsOne(scheme: ColorScheme) async throws {

        var state = makeState()
        state.failure = "Не удалось переименовать: папка занята"

        let failed = try await rendered(state, scheme)
        #expect(failed.shows("Не удалось переименовать"), "\(failed)")

        let fine = try await rendered(makeState(), scheme)
        #expect(!fine.shows("Не удалось"), "\(fine)")
    }

    // MARK: - Helpers

    private let size = CGSize(width: 920, height: 420)

    private func view(_ state: CallsListState, _ scheme: ColorScheme) -> some View {

        CallsListView(state: state, event: { _ in }).environment(\.colorScheme, scheme)
    }

    private func rendered(_ state: CallsListState, _ scheme: ColorScheme) async throws -> RenderedText {

        try await read(Offscreen.host(view(state, scheme), size: size, scheme: scheme))
    }

    private func read(_ host: NSView) async throws -> RenderedText {

        let image = try #require(Offscreen.sharpSnapshot(host))
        return try await offPool { try readText(in: image) }
    }

    private func makeState() -> CallsListState {

        let start = { ISO8601DateFormatter().date(from: $0)! }
        return CallsListState(rows: [
            .init(id: "2026.10.21-1230", title: "Запуск", start: start("2026-10-21T12:30:00Z"), duration: 2_820, timeZone: .gmt, editable: true),
            .init(id: "2026.10.20-1600", title: "Синк по OKR", start: start("2026-10-20T16:00:00Z"), duration: 4_320, timeZone: .gmt, editable: true),
            .init(id: "2026.10.17-1100", title: "", start: start("2026-10-17T11:00:00Z"), duration: nil, timeZone: .gmt, editable: true),
        ])
    }
}
