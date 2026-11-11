import AppKit
@testable import Audelin
import Testing

@MainActor
struct CallsSearchToolbarTests {

    @Test func typingSendsTheFieldsText() throws {
        var sent: [String] = []
        let sut = CallsSearchToolbar(placeholder: "Поиск", send: { sent.append($0) })
        let field = try #require(searchField(sut))

        field.stringValue = "okr"
        field.sendAction(field.action, to: field.target)
        field.stringValue = ""
        field.sendAction(field.action, to: field.target)

        #expect(sent == ["okr", ""])
    }

    @Test func showsAndRetitlesItsPlaceholder() throws {
        let sut = CallsSearchToolbar(placeholder: "Поиск", send: { _ in })
        let field = try #require(searchField(sut))
        #expect(field.placeholderString == "Поиск")

        sut.retitle(placeholder: "Search")

        #expect(field.placeholderString == "Search")
    }

    private func searchField(_ sut: CallsSearchToolbar) -> NSSearchField? {
        #expect(sut.toolbarDefaultItemIdentifiers(sut.toolbar).contains(CallsSearchToolbar.searchItem))
        let item = sut.toolbar(sut.toolbar, itemForItemIdentifier: CallsSearchToolbar.searchItem, willBeInsertedIntoToolbar: true)
        return (item as? NSSearchToolbarItem)?.searchField
    }
}
