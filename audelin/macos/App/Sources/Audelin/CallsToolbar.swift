import AppKit
import GlassLedger
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

/// The selected call's row actions over the list, with Copy trailing over the detail.
/// A call's own window has the same actions without a split separator.
@MainActor
final class CallsToolbar: NSObject, NSToolbarDelegate, NSToolbarItemValidation {
    static let titleItem = NSToolbarItem.Identifier("calls.title")
    static let actionsItem = NSToolbarItem.Identifier("calls.actions")
    static let deleteItem = NSToolbarItem.Identifier("calls.delete")
    static let copyItem = NSToolbarItem.Identifier("calls.copy")
    static let separatorItem = NSToolbarItem.Identifier("calls.divider")

    let toolbar: NSToolbar
    private let title: NSToolbarItem?
    private let actions = NSToolbarItemGroup(itemIdentifier: actionsItem)
    private let delete = NSToolbarItem(itemIdentifier: deleteItem)
    private let copy = NSToolbarItem(itemIdentifier: copyItem)
    private let separator: NSTrackingSeparatorToolbarItem?
    private let act: (SummaryPreviewEvent) -> Void
    private var enabled = CallActions(call: false, copy: false)
    private static let grouped: [(event: SummaryPreviewEvent, symbol: String, id: String)] = [
        (.open, "folder", "calls.open"), (.rename, "pencil", "calls.rename"),
    ]

    init(identifier: String, splitView: NSSplitView? = nil, title: String? = nil, text: SummaryPreviewText,
         act: @escaping (SummaryPreviewEvent) -> Void) {
        self.act = act
        toolbar = NSToolbar(identifier: identifier)
        self.title = title.map { title in
            let item = NSToolbarItem(itemIdentifier: Self.titleItem)
            let label = NSTextField(labelWithString: title)
            let tokens = GlassLedger.for(.light)
            label.font = tokens.nsUi(tokens.typeBody, .bold)
            label.lineBreakMode = .byTruncatingTail
            item.view = label
            return item
        }
        separator = splitView.map {
            NSTrackingSeparatorToolbarItem(identifier: Self.separatorItem, splitView: $0, dividerIndex: 0)
        }
        super.init()
        actions.subitems = Self.grouped.enumerated().map { index, entry in
            let item = NSToolbarItem(itemIdentifier: .init(entry.id))
            item.image = NSImage(systemSymbolName: entry.symbol, accessibilityDescription: nil)
            item.target = self
            item.action = #selector(acted(_:))
            item.tag = index
            return item
        }
        actions.controlRepresentation = .expanded
        actions.selectionMode = .momentary
        delete.image = NSImage(systemSymbolName: "trash", accessibilityDescription: nil)
        delete.isBordered = true
        delete.target = self
        delete.action = #selector(deleted)
        copy.image = NSImage(systemSymbolName: "doc.on.doc", accessibilityDescription: nil)
        copy.isBordered = true
        copy.target = self
        copy.action = #selector(copied)
        retitle(text: text)
        show(.init(call: false, copy: false))
        toolbar.delegate = self
        toolbar.displayMode = .iconOnly
        toolbar.allowsUserCustomization = false
    }

    /// The buttons' names, as when the language changes.
    func retitle(text: SummaryPreviewText, title: String? = nil) {
        if let title { (self.title?.view as? NSTextField)?.stringValue = title }
        for (item, phrase) in zip(actions.subitems, [SummaryPreviewPhrase.open, .rename]) { name(item, text(phrase)) }
        name(delete, text(.delete))
        name(copy, text(.copy))
    }

    /// Enables the buttons that act on the call shown; disabled ones stay in place.
    func show(_ enabled: CallActions) {
        self.enabled = enabled
        actions.subitems.forEach { $0.isEnabled = enabled.call }
        delete.isEnabled = enabled.call
        copy.isEnabled = enabled.copy
        toolbar.validateVisibleItems()
    }

    /// AppKit asks before it draws an item; the answer is the call shown, not whether the action exists.
    func validateToolbarItem(_ item: NSToolbarItem) -> Bool {
        item.itemIdentifier == Self.copyItem ? enabled.copy : enabled.call
    }

    private func name(_ item: NSToolbarItem, _ title: String) {
        item.label = title
        item.toolTip = title
        item.image?.accessibilityDescription = title
    }

    @objc private func acted(_ item: NSToolbarItem) { act(Self.grouped[item.tag].event) }
    @objc private func deleted() { act(.delete) }
    @objc private func copied() { act(.copy) }

    private var identifiers: [NSToolbarItem.Identifier] {
        (title == nil ? [] : [Self.titleItem, .flexibleSpace]) + [Self.actionsItem, Self.deleteItem] + (separator == nil ? [] : [Self.separatorItem]) + [.flexibleSpace, Self.copyItem]
    }

    func toolbarDefaultItemIdentifiers(_ toolbar: NSToolbar) -> [NSToolbarItem.Identifier] { identifiers }
    func toolbarAllowedItemIdentifiers(_ toolbar: NSToolbar) -> [NSToolbarItem.Identifier] { identifiers }
    func toolbar(_ toolbar: NSToolbar, itemForItemIdentifier identifier: NSToolbarItem.Identifier,
                 willBeInsertedIntoToolbar flag: Bool) -> NSToolbarItem? {
        switch identifier {
        case Self.titleItem: title
        case Self.actionsItem: actions
        case Self.deleteItem: delete
        case Self.copyItem: copy
        case Self.separatorItem: separator
        default: nil
        }
    }
}
