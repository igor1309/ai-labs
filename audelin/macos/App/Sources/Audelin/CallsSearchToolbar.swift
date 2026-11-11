import AppKit

/// The calls window's toolbar: a search field at the right that sends its
/// text as it is typed. Esc or its clear button empties it.
@MainActor
final class CallsSearchToolbar: NSObject, NSToolbarDelegate {
    static let searchItem = NSToolbarItem.Identifier("calls.search")

    let toolbar = NSToolbar(identifier: "CallsToolbar")
    private let item = NSSearchToolbarItem(itemIdentifier: searchItem)
    private let send: (String) -> Void

    init(placeholder: String, send: @escaping (String) -> Void) {
        self.send = send
        super.init()
        item.preferredWidthForSearchField = 200
        item.searchField.sendsSearchStringImmediately = true
        item.searchField.placeholderString = placeholder
        item.searchField.target = self
        item.searchField.action = #selector(changed(_:))
        toolbar.delegate = self
        toolbar.displayMode = .iconOnly
        toolbar.allowsUserCustomization = false
    }

    /// Moves the keyboard into the field, as ⌘F does.
    func focus() { item.beginSearchInteraction() }

    /// The placeholder, as when the language changes.
    func retitle(placeholder: String) { item.searchField.placeholderString = placeholder }

    @objc private func changed(_ field: NSSearchField) { send(field.stringValue) }

    func toolbarDefaultItemIdentifiers(_ toolbar: NSToolbar) -> [NSToolbarItem.Identifier] { [.flexibleSpace, Self.searchItem] }
    func toolbarAllowedItemIdentifiers(_ toolbar: NSToolbar) -> [NSToolbarItem.Identifier] { [.flexibleSpace, Self.searchItem] }
    func toolbar(_ toolbar: NSToolbar, itemForItemIdentifier identifier: NSToolbarItem.Identifier,
                 willBeInsertedIntoToolbar flag: Bool) -> NSToolbarItem? {
        identifier == Self.searchItem ? item : nil
    }
}
