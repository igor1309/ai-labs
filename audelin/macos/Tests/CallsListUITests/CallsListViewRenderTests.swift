import BlockingTestWork
import CallsListUI
import RenderedText
import SwiftUI
import Testing

@MainActor
struct CallsListViewRenderTests {

    @Test(arguments: [ColorScheme.light, .dark])
    func eachCallShowsItsOwnSummaryProgressAndOutcome(scheme: ColorScheme) async throws {
        let statuses = [
            "Итоги ожидают запуска",
            "Готовим итоги…",
            "Итоги готовы",
            "Итоги готовы; имена не определены",
            "Не удалось составить или сохранить итоги. Расшифровка и аудио сохранены.",
            "Подготовка итогов прервана; автоматического повтора не будет.",
        ]
        let titles = ["Ожидание", "Подготовка", "Успех", "Предупреждение", "Ошибка", "Прерывание"]
        let rows = zip(titles, statuses).enumerated().map { index, values in
            CallsListState.Row(id: "call-\(index)", title: values.0, start: Date(timeIntervalSince1970: Double(index) * 60),
                              duration: 60, timeZone: .gmt, editable: true, summaryStatus: values.1)
        }
        // Keep each pair entirely in the viewport; lazy scroll rows outside it are not rendered.
        for start in stride(from: 0, to: rows.count, by: 2) {
            let pair = Array(rows[start..<min(start + 2, rows.count)])
            let host = Offscreen.host(view(.init(rows: pair), scheme), size: CGSize(width: 920, height: 300), scheme: scheme)
            host.window?.isReleasedWhenClosed = false
            defer { host.window?.close() }
            let text = try await read(host)
            for (index, row) in pair.enumerated() {
                #expect(text.shows(row.summaryStatus), "\(scheme): \(text)")
                let titleLine = try #require(text.lines.firstIndex { RenderedText(lines: [$0]).shows(row.displayTitle) })
                let end = index + 1 < pair.count
                    ? try #require(text.lines.firstIndex { RenderedText(lines: [$0]).shows(pair[index + 1].displayTitle) })
                    : text.lines.endIndex
                try #require(titleLine < end)
                let rowText = RenderedText(lines: Array(text.lines[titleLine..<end]))
                #expect(rowText.shows(row.summaryStatus), "\(row.displayTitle): \(rowText)")
            }
        }
    }

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
