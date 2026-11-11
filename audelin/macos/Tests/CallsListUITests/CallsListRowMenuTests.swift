import AppKit
import CallsListUI
import RenderedText
import SwiftUI
import Testing

@MainActor
struct CallsListRowMenuTests {

    @Test func rightClickSelectsTheRowBeforeItsMenuIsBuilt() throws {

        let spy = EventSpy()
        let host = Offscreen.host(view(makeState(), spy), size: size)

        let menu = try #require(try target("2026.10.20-1600", in: host).menu(for: rightClick()))

        #expect(spy.events == [.select("2026.10.20-1600")])
        #expect(menu.items.map(\.title) == ["Открыть", "Показать заметки", "Переименовать", "Повторить итоги", "", "Удалить…"])
    }

    @Test func menuShowsTheRowsKeys() throws {

        let host = Offscreen.host(view(makeState(), EventSpy()), size: size)

        let menu = try #require(try target("2026.10.20-1600", in: host).menu(for: rightClick()))

        let items = menu.items.filter { !$0.isSeparatorItem }
        #expect(items.map(\.keyEquivalent) == ["\r", " ", "r", "", "\u{8}"])
        #expect(items.map(\.keyEquivalentModifierMask) == [[], [], .command, [], .command])
    }

    @Test func menuItemsActOnTheRightClickedRow() throws {

        let spy = EventSpy()
        let host = Offscreen.host(view(makeState(), spy), size: size)
        let menu = try #require(try target("2026.10.20-1600", in: host).menu(for: rightClick()))

        for index in menu.items.indices where !menu.items[index].isSeparatorItem { menu.performActionForItem(at: index) }

        let id = "2026.10.20-1600"
        #expect(spy.events == [.select(id), .open(id), .preview(id), .beginRename(id), .retrySummary(id), .askDelete(id)])
    }

    @Test func busyListDisablesWhatWaitsForIt() throws {

        var state = makeState()
        state.busy = true
        let host = Offscreen.host(view(state, EventSpy()), size: size)

        let menu = try #require(try target("2026.10.20-1600", in: host).menu(for: rightClick()))

        #expect(menu.items.map(\.isEnabled) == [false, true, false, false, false, false])
    }

    @Test func rowWithoutNotesOrFailedSummaryOmitsTheirItems() throws {

        let host = Offscreen.host(view(makeState(), EventSpy()), size: size)

        let menu = try #require(try target("2026.10.21-1230", in: host).menu(for: rightClick()))

        #expect(menu.items.map(\.title) == ["Открыть", "Переименовать", "", "Удалить…"])
    }

    // MARK: - Helpers

    private let size = CGSize(width: 920, height: 420)

    @MainActor private final class EventSpy {
        var events: [CallsListEvent] = []
    }

    private func view(_ state: CallsListState, _ spy: EventSpy) -> some View {

        CallsListView(state: state, event: { spy.events.append($0) }).environment(\.colorScheme, .light)
    }

    private func target(_ id: String, in view: NSView) throws -> NSView {

        try #require(find("calls.row.\(id)", in: view))
    }

    private func find(_ identifier: String, in view: NSView) -> NSView? {

        if view.accessibilityIdentifier() == identifier { return view }
        return view.subviews.lazy.compactMap { find(identifier, in: $0) }.first
    }

    private func rightClick() throws -> NSEvent {

        try #require(NSEvent.mouseEvent(
            with: .rightMouseDown, location: .zero, modifierFlags: [], timestamp: 0,
            windowNumber: 0, context: nil, eventNumber: 0, clickCount: 1, pressure: 1
        ))
    }

    private func makeState() -> CallsListState {

        return CallsListState(rows: [
            .init(id: "2026.10.21-1230", title: "Запуск", displayTitle: "Запуск", day: .init(title: "Сегодня", count: "1 звонок"), time: "12:30", duration: "47:00", editable: true),
            .init(id: "2026.10.20-1600", title: "Синк по OKR", displayTitle: "Синк по OKR", day: .init(title: "Вчера", count: "1 звонок"), time: "16:00", duration: "1:12:00", editable: true, hasNotes: true, canRetrySummary: true, summary: .failed),
        ])
    }
}
