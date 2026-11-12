import AppKit
import SummaryPreviewUI

/// Which of the toolbar's buttons act: all need a selected call, Копировать
/// also its notes.
struct CallActions: Equatable {
    var call: Bool
    var copy: Bool
}

/// The toolbar's buttons for the call the detail shows.
func callActions(_ state: SummaryPreviewState?) -> CallActions {
    guard let state else { return .init(call: false, copy: false) }
    if case .markdown = state.notes { return .init(call: true, copy: true) }
    return .init(call: true, copy: false)
}

/// A window's toolbar: icon-only buttons on the selected call in two groups,
/// Копировать, Открыть and Переименовать, then Удалить… alone, each naming
/// itself in a tooltip; then, in the calls window, a search field that sends
/// its text as it is typed. Esc or its clear button empties it.
@MainActor
final class CallsToolbar: NSObject, NSToolbarDelegate {
    static let actionsItem = NSToolbarItem.Identifier("calls.actions")
    static let deleteItem = NSToolbarItem.Identifier("calls.delete")
    static let searchItem = NSToolbarItem.Identifier("calls.search")

    let toolbar: NSToolbar
    private let actions = NSToolbarItemGroup(itemIdentifier: actionsItem)
    private let delete = NSToolbarItem(itemIdentifier: deleteItem)
    private let search: NSSearchToolbarItem?
    private let send: (String) -> Void
    private let act: (SummaryPreviewEvent) -> Void
    private static let grouped: [(event: SummaryPreviewEvent, symbol: String, id: String)] = [
        (.copy, "doc.on.doc", "calls.copy"), (.open, "folder", "calls.open"), (.rename, "pencil", "calls.rename"),
    ]

    /// `placeholder` nil leaves the search field out, as in the call's own window.
    init(identifier: String, placeholder: String?, text: SummaryPreviewText,
         send: @escaping (String) -> Void = { _ in }, act: @escaping (SummaryPreviewEvent) -> Void) {
        self.send = send
        self.act = act
        toolbar = NSToolbar(identifier: identifier)
        search = placeholder.map { _ in NSSearchToolbarItem(itemIdentifier: Self.searchItem) }
        super.init()
        actions.subitems = Self.grouped.map { entry in
            let item = NSToolbarItem(itemIdentifier: .init(entry.id))
            item.image = NSImage(systemSymbolName: entry.symbol, accessibilityDescription: nil)
            item.target = self
            item.action = #selector(acted(_:))
            item.tag = Self.grouped.firstIndex { $0.id == entry.id }!
            return item
        }
        actions.controlRepresentation = .expanded
        actions.selectionMode = .momentary
        delete.image = NSImage(systemSymbolName: "trash", accessibilityDescription: nil)
        delete.isBordered = true
        delete.target = self
        delete.action = #selector(deleted)
        if let search, let placeholder {
            search.preferredWidthForSearchField = 200
            search.searchField.sendsSearchStringImmediately = true
            search.searchField.placeholderString = placeholder
            search.searchField.target = self
            search.searchField.action = #selector(changed(_:))
        }
        retitle(text: text, placeholder: placeholder)
        show(.init(call: false, copy: false))
        toolbar.delegate = self
        toolbar.displayMode = .iconOnly
        toolbar.allowsUserCustomization = false
    }

    /// Moves the keyboard into the field, as ⌘F does.
    func focus() { search?.beginSearchInteraction() }

    /// The buttons' names and the placeholder, as when the language changes.
    func retitle(text: SummaryPreviewText, placeholder: String?) {
        let phrases: [SummaryPreviewPhrase] = [.copy, .open, .rename]
        for (item, phrase) in zip(actions.subitems, phrases) { name(item, text(phrase)) }
        name(delete, text(.delete))
        if let placeholder { search?.searchField.placeholderString = placeholder }
    }

    /// Enables the buttons that act on the call shown; disabled ones stay in place.
    func show(_ enabled: CallActions) {
        for (index, item) in actions.subitems.enumerated() { item.isEnabled = index == 0 ? enabled.copy : enabled.call }
        delete.isEnabled = enabled.call
    }

    private func name(_ item: NSToolbarItem, _ title: String) {
        item.label = title
        item.toolTip = title
        item.image?.accessibilityDescription = title
    }

    @objc private func acted(_ item: NSToolbarItem) { act(Self.grouped[item.tag].event) }
    @objc private func deleted() { act(.delete) }
    @objc private func changed(_ field: NSSearchField) { send(field.stringValue) }

    private var identifiers: [NSToolbarItem.Identifier] {
        [.flexibleSpace, Self.actionsItem, Self.deleteItem] + (search == nil ? [] : [Self.searchItem])
    }

    func toolbarDefaultItemIdentifiers(_ toolbar: NSToolbar) -> [NSToolbarItem.Identifier] { identifiers }
    func toolbarAllowedItemIdentifiers(_ toolbar: NSToolbar) -> [NSToolbarItem.Identifier] { identifiers }
    func toolbar(_ toolbar: NSToolbar, itemForItemIdentifier identifier: NSToolbarItem.Identifier,
                 willBeInsertedIntoToolbar flag: Bool) -> NSToolbarItem? {
        switch identifier {
        case Self.actionsItem: actions
        case Self.deleteItem: delete
        case Self.searchItem: search
        default: nil
        }
    }
}
