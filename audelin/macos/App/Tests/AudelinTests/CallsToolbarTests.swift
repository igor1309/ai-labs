import AppKit
@testable import Audelin
import SummaryPreviewUI
import Testing

@MainActor
struct CallsToolbarTests {

    @Test func typingSendsTheFieldsText() throws {
        var sent: [String] = []
        let sut = makeSUT(send: { sent.append($0) })
        let field = try #require(searchField(sut))

        field.stringValue = "okr"
        field.sendAction(field.action, to: field.target)
        field.stringValue = ""
        field.sendAction(field.action, to: field.target)

        #expect(sent == ["okr", ""])
    }

    @Test func showsAndRetitlesItsPlaceholder() throws {
        let sut = makeSUT()
        let field = try #require(searchField(sut))
        #expect(field.placeholderString == "Поиск")

        sut.retitle(text: .init(language: .english), placeholder: "Search")

        #expect(field.placeholderString == "Search")
    }

    @Test func putsTheActionGroupsBeforeTheSearchField() {
        let sut = makeSUT()

        #expect(sut.toolbarDefaultItemIdentifiers(sut.toolbar)
                == [.flexibleSpace, CallsToolbar.actionsItem, CallsToolbar.deleteItem, CallsToolbar.searchItem])
    }

    @Test func theCallsOwnWindowHasTheButtonsAndNoSearch() {
        let sut = CallsToolbar(identifier: "test", placeholder: nil, text: .init(language: .russian), act: { _ in })

        #expect(sut.toolbarDefaultItemIdentifiers(sut.toolbar) == [.flexibleSpace, CallsToolbar.actionsItem, CallsToolbar.deleteItem])
    }

    @Test func eachButtonNamesItselfInItsTooltipAndReportsItsAction() throws {
        var events: [SummaryPreviewEvent] = []
        let sut = makeSUT(act: { events.append($0) })
        sut.show(.init(call: true, copy: true))
        let buttons = try self.buttons(sut)

        #expect(buttons.map(\.toolTip) == ["Копировать", "Открыть", "Переименовать", "Удалить…"])
        for item in buttons { _ = (item.target as? NSObject)?.perform(item.action, with: item) }
        #expect(events == [.copy, .open, .rename, .delete])
    }

    @Test func retitlesTheButtons() throws {
        let sut = makeSUT()

        sut.retitle(text: .init(language: .english), placeholder: "Search")

        #expect(try buttons(sut).map(\.toolTip) == ["Copy", "Open", "Rename", "Delete…"])
    }

    @Test(arguments: [(CallActions(call: false, copy: false), [false, false, false, false]),
                      (CallActions(call: true, copy: false), [false, true, true, true]),
                      (CallActions(call: true, copy: true), [true, true, true, true])])
    func enablesOnlyTheButtonsThatActOnTheCallShown(actions: CallActions, enabled: [Bool]) throws {
        let sut = makeSUT()

        sut.show(actions)

        #expect(try buttons(sut).map(\.isEnabled) == enabled)
    }

    @Test func copyNeedsNotesAndTheRestNeedACall() {
        func state(_ notes: SummaryPreviewState.Notes) -> SummaryPreviewState {
            .init(title: "Zoom", date: "Сегодня, 10:00", duration: "28:00", notes: notes)
        }

        #expect(callActions(nil) == .init(call: false, copy: false))
        #expect(callActions(state(.markdown("# A"))) == .init(call: true, copy: true))
        for notes in [SummaryPreviewState.Notes.unreadable("x"), .preparing, .failed("x"), .none(notesOff: true)] {
            #expect(callActions(state(notes)) == .init(call: true, copy: false))
        }
    }

    private func makeSUT(send: @escaping (String) -> Void = { _ in },
                         act: @escaping (SummaryPreviewEvent) -> Void = { _ in }) -> CallsToolbar {
        CallsToolbar(identifier: "test", placeholder: "Поиск", text: .init(language: .russian), send: send, act: act)
    }

    private func item(_ sut: CallsToolbar, _ identifier: NSToolbarItem.Identifier) -> NSToolbarItem? {
        sut.toolbar(sut.toolbar, itemForItemIdentifier: identifier, willBeInsertedIntoToolbar: true)
    }

    private func buttons(_ sut: CallsToolbar) throws -> [NSToolbarItem] {
        let group = try #require(item(sut, CallsToolbar.actionsItem) as? NSToolbarItemGroup)
        return group.subitems + [try #require(item(sut, CallsToolbar.deleteItem))]
    }

    private func searchField(_ sut: CallsToolbar) -> NSSearchField? {
        (item(sut, CallsToolbar.searchItem) as? NSSearchToolbarItem)?.searchField
    }
}
