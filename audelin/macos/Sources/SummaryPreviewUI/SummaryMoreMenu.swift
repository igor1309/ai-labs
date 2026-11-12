import AppKit
import SwiftUI

/// The ⋯ pull-down: Открыть, Переименовать, Повторить итоги when the call can
/// retry, then Удалить… after a separator. Each item is set in the given font
/// and colour, Удалить… in the destructive one, and reports its event.
struct SummaryMoreMenu: NSViewRepresentable {
    struct Item: Equatable {
        let title: String
        let event: SummaryPreviewEvent
        let destructive: Bool
    }

    var items: [Item]
    var label: String
    var font: NSFont
    var ink: NSColor
    var destructive: NSColor
    var event: (SummaryPreviewEvent) -> Void

    func makeCoordinator() -> Coordinator { Coordinator() }

    func makeNSView(context: Context) -> NSPopUpButton {
        let button = NSPopUpButton(frame: .zero, pullsDown: true)
        button.isBordered = false
        button.focusRingType = .exterior
        (button.cell as? NSPopUpButtonCell)?.arrowPosition = .noArrow
        button.setAccessibilityIdentifier("preview.more")
        return button
    }

    func updateNSView(_ button: NSPopUpButton, context: Context) {
        context.coordinator.event = event
        button.removeAllItems()
        // A pull-down shows its first item as the button's face.
        button.addItem(withTitle: "")
        let face = button.lastItem!
        face.image = NSImage(systemSymbolName: "ellipsis", accessibilityDescription: label)?
            .withSymbolConfiguration(.init(pointSize: font.pointSize, weight: .regular).applying(.init(hierarchicalColor: ink)))
        for item in items {
            if item.destructive { button.menu?.addItem(.separator()) }
            let entry = NSMenuItem(title: item.title, action: #selector(Coordinator.select(_:)), keyEquivalent: "")
            entry.attributedTitle = NSAttributedString(string: item.title, attributes: [
                .font: font, .foregroundColor: item.destructive ? destructive : ink,
            ])
            entry.representedObject = item.event
            entry.target = context.coordinator
            button.menu?.addItem(entry)
        }
        button.setAccessibilityLabel(label)
    }

    @MainActor
    final class Coordinator: NSObject {
        var event: ((SummaryPreviewEvent) -> Void)?

        @objc func select(_ item: NSMenuItem) {
            if let chosen = item.representedObject as? SummaryPreviewEvent { event?(chosen) }
        }
    }
}
