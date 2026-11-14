import AppKit
import GlassLedger
import SummaryPreviewUI

/// Which of the toolbar's buttons act: all need a selected call, Копировать
/// also its notes. Merge needs no call; while `merging`, it leaves merge mode.
public struct CallActions: Equatable, Sendable {
    public var call: Bool
    public var copy: Bool
    public var merge: Bool
    public var merging: Bool

    public init(call: Bool, copy: Bool, merge: Bool = false, merging: Bool = false) {
        self.call = call; self.copy = copy; self.merge = merge; self.merging = merging
    }
}

/// The toolbar's buttons for the call the detail shows.
public func callActions(_ state: SummaryPreviewState?) -> CallActions {
    guard let state else { return .init(call: false, copy: false) }
    if case .markdown = state.notes { return .init(call: true, copy: true) }
    return .init(call: true, copy: false)
}

/// The selected call's row actions over the list, with Copy trailing over the detail.
/// A call's own window has the same actions without a split separator.
@MainActor
public final class CallsToolbar: NSObject, NSToolbarDelegate, NSToolbarItemValidation {
    public static let titleItem = NSToolbarItem.Identifier("calls.title")
    public static let actionsItem = NSToolbarItem.Identifier("calls.actions")
    public static let deleteItem = NSToolbarItem.Identifier("calls.delete")
    public static let copyItem = NSToolbarItem.Identifier("calls.copy")
    public static let mergeItem = NSToolbarItem.Identifier("calls.merge")
    public static let separatorItem = NSToolbarItem.Identifier("calls.divider")
    /// Copy's symbol, and the one it shows for a moment after it copies.
    public static let copySymbol = "doc.on.doc", copiedSymbol = "checkmark"

    public let toolbar: NSToolbar
    private let title: NSToolbarItem?
    private let actions = NSToolbarItemGroup(itemIdentifier: actionsItem)
    private let delete = NSToolbarItem(itemIdentifier: deleteItem)
    private let copy = NSToolbarItem(itemIdentifier: copyItem)
    /// Enters and leaves merge mode; only the calls window, which passes `merge`, has it.
    private let mergeButton: NSToolbarItem?
    private let merge: (() -> Void)?
    private var text: SummaryPreviewText
    private let separator: NSTrackingSeparatorToolbarItem?
    private let act: (SummaryPreviewEvent) -> Void
    private let settle: @MainActor () async -> Void
    private var copiedMark: Task<Void, Never>?
    private var enabled = CallActions(call: false, copy: false)
    private static let grouped: [(event: SummaryPreviewEvent, symbol: String, id: String)] = [
        (.open, "folder", "calls.open"), (.rename, "pencil", "calls.rename"),
    ]

    public init(identifier: String, splitView: NSSplitView? = nil, title: String? = nil, text: SummaryPreviewText,
         act: @escaping (SummaryPreviewEvent) -> Void, merge: (() -> Void)? = nil,
         settle: @escaping @MainActor () async -> Void = { try? await Task.sleep(for: .seconds(1.5)) }) {
        self.act = act
        self.settle = settle
        self.merge = merge
        self.text = text
        mergeButton = merge.map { _ in NSToolbarItem(itemIdentifier: Self.mergeItem) }
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
        copy.image = NSImage(systemSymbolName: Self.copySymbol, accessibilityDescription: nil)
        copy.isBordered = true
        copy.target = self
        copy.action = #selector(copied)
        if let mergeButton {
            // A button view, not a bordered item: only a view carries the identifier a live test finds it by.
            let button = NSButton(image: NSImage(systemSymbolName: "arrow.triangle.merge", accessibilityDescription: nil)!,
                                  target: self, action: #selector(merged))
            button.bezelStyle = .toolbar
            button.setAccessibilityIdentifier(Self.mergeItem.rawValue)
            mergeButton.view = button
            mergeButton.target = self
            mergeButton.action = #selector(merged)
        }
        retitle(text: text)
        show(.init(call: false, copy: false))
        toolbar.delegate = self
        toolbar.displayMode = .iconOnly
        toolbar.allowsUserCustomization = false
    }

    /// The buttons' names, as when the language changes.
    public func retitle(text: SummaryPreviewText, title: String? = nil) {
        self.text = text
        if let mergeButton { name(mergeButton, text(enabled.merging ? .mergeDone : .mergeCalls)) }
        if let title { (self.title?.view as? NSTextField)?.stringValue = title }
        for (item, phrase) in zip(actions.subitems, [SummaryPreviewPhrase.open, .rename]) { name(item, text(phrase)) }
        name(delete, text(.delete))
        name(copy, text(.copy))
    }

    /// Enables the buttons that act on the call shown; disabled ones stay in place.
    public func show(_ enabled: CallActions) {
        self.enabled = enabled
        actions.subitems.forEach { $0.isEnabled = enabled.call }
        delete.isEnabled = enabled.call
        copy.isEnabled = enabled.copy
        if let mergeButton {
            mergeButton.isEnabled = enabled.merge
            name(mergeButton, text(enabled.merging ? .mergeDone : .mergeCalls))
            let button = mergeButton.view as? NSButton
            button?.isEnabled = enabled.merge
            button?.image = NSImage(systemSymbolName: enabled.merging ? "checkmark" : "arrow.triangle.merge",
                                    accessibilityDescription: mergeButton.label)
        }
        toolbar.validateVisibleItems()
    }

    /// AppKit asks before it draws an item; the answer is the call shown, not whether the action exists.
    public func validateToolbarItem(_ item: NSToolbarItem) -> Bool {
        switch item.itemIdentifier {
        case Self.copyItem: enabled.copy
        case Self.mergeItem: enabled.merge
        default: enabled.call
        }
    }

    private func name(_ item: NSToolbarItem, _ title: String) {
        item.label = title
        item.toolTip = title
        item.image?.accessibilityDescription = title
        (item.view as? NSButton)?.setAccessibilityLabel(title)
        (item.view as? NSButton)?.toolTip = title
    }

    @objc private func acted(_ item: NSToolbarItem) { act(Self.grouped[item.tag].event) }
    @objc private func deleted() { act(.delete) }
    @objc private func merged() { merge?() }
    @objc private func copied() {
        act(.copy)
        mark(copy, Self.copiedSymbol)
        copiedMark?.cancel()
        copiedMark = Task { [weak self] in
            guard let self else { return }
            await settle()
            guard !Task.isCancelled else { return }
            mark(copy, Self.copySymbol)
        }
    }

    private func mark(_ item: NSToolbarItem, _ symbol: String) {
        let name = item.image?.accessibilityDescription
        item.image = NSImage(systemSymbolName: symbol, accessibilityDescription: name)
    }

    private var identifiers: [NSToolbarItem.Identifier] {
        (title == nil ? [] : [Self.titleItem, .flexibleSpace]) + (mergeButton == nil ? [] : [Self.mergeItem]) + [Self.actionsItem, Self.deleteItem] + (separator == nil ? [] : [Self.separatorItem]) + [.flexibleSpace, Self.copyItem]
    }

    public func toolbarDefaultItemIdentifiers(_ toolbar: NSToolbar) -> [NSToolbarItem.Identifier] { identifiers }
    public func toolbarAllowedItemIdentifiers(_ toolbar: NSToolbar) -> [NSToolbarItem.Identifier] { identifiers }
    public func toolbar(_ toolbar: NSToolbar, itemForItemIdentifier identifier: NSToolbarItem.Identifier,
                 willBeInsertedIntoToolbar flag: Bool) -> NSToolbarItem? {
        switch identifier {
        case Self.titleItem: title
        case Self.actionsItem: actions
        case Self.deleteItem: delete
        case Self.copyItem: copy
        case Self.mergeItem: mergeButton
        case Self.separatorItem: separator
        default: nil
        }
    }
}
