import AppKit
import SwiftUI

/// One entry in a row's context menu; `nil` in a list is a separator.
struct RowMenuItem {
    var title: String
    var identifier: String? = nil
    var key: String = ""
    var modifiers: NSEvent.ModifierFlags = []
    var isEnabled = true
    var help: String?
    var action: () -> Void
}

/// AppKit owns a row's right-click: SwiftUI's `contextMenu` has no hook for a
/// menu about to open, so this view selects the row and then builds the menu.
/// It takes only right-clicks and Control-clicks; every other event passes
/// through to the SwiftUI row under it.
struct RowMenuTarget: NSViewRepresentable {
    var identifier: String
    var select: () -> Void
    var items: () -> [RowMenuItem?]

    func makeNSView(context: Context) -> RowMenuView { RowMenuView() }

    func updateNSView(_ view: RowMenuView, context: Context) {
        view.select = select
        view.items = items
        view.setAccessibilityIdentifier(identifier)
    }
}

final class RowMenuView: NSView {
    var select: () -> Void = {}
    var items: () -> [RowMenuItem?] = { [] }

    override func hitTest(_ point: NSPoint) -> NSView? {
        guard let event = NSApp.currentEvent, Self.opensMenu(event) else { return nil }
        return super.hitTest(point)
    }

    override func menu(for event: NSEvent) -> NSMenu? {
        select()
        return makeRowMenu(items())
    }

    private static func opensMenu(_ event: NSEvent) -> Bool {
        switch event.type {
        case .rightMouseDown, .rightMouseUp: true
        case .leftMouseDown, .leftMouseUp: event.modifierFlags.contains(.control)
        default: false
        }
    }
}

func makeRowMenu(_ items: [RowMenuItem?]) -> NSMenu {
    let menu = NSMenu()
    menu.autoenablesItems = false
    for item in items {
        guard let item else { menu.addItem(.separator()); continue }
        let entry = ActionMenuItem(title: item.title, action: item.action)
        entry.setAccessibilityIdentifier(item.identifier)
        entry.setAccessibilityValue(item.title)
        entry.keyEquivalent = item.key
        entry.keyEquivalentModifierMask = item.modifiers
        entry.isEnabled = item.isEnabled
        entry.toolTip = item.help
        entry.setAccessibilityHelp(item.help)
        menu.addItem(entry)
    }
    return menu
}

private final class ActionMenuItem: NSMenuItem {
    private let run: () -> Void

    init(title: String, action: @escaping () -> Void) {
        run = action
        super.init(title: title, action: #selector(runAction), keyEquivalent: "")
        target = self
    }

    @available(*, unavailable) required init(coder: NSCoder) { fatalError("init(coder:) is not used") }

    override func accessibilityPerformPress() -> Bool {
        guard isEnabled else { return false }
        menu?.cancelTracking()
        run()
        return true
    }

    @objc private func runAction() { run() }
}

/// Opens a row's menu from its menu target, for an assistive app's show-menu action.
@MainActor func popUpRowMenu(identifier: String, items: [RowMenuItem?]) {
    guard !items.isEmpty else { return }
    func target(in view: NSView) -> NSView? {
        if view is RowMenuView, view.accessibilityIdentifier() == identifier { return view }
        return view.subviews.lazy.compactMap(target).first
    }
    guard let view = NSApp.windows.lazy.compactMap({ $0.contentView.flatMap(target) }).first else { return }
    let menu = makeRowMenu(items)
    // Menu tracking runs its own loop; let the accessibility request return first.
    DispatchQueue.main.async { menu.popUp(positioning: nil, at: NSPoint(x: 0, y: view.bounds.midY), in: view) }
}
