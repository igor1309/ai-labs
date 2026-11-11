import AppKit
import SwiftUI

/// These controls report proposals; only the supplied presentation values are
/// authoritative, including when the caller rejects or normalizes a proposal.
struct SettingsNotesMenu: NSViewRepresentable {
    var runtime: SettingsState.NotesRuntime
    var serviceLabel: String
    var font: NSFont
    var action: (SettingsState.NotesRuntime.Kind) -> Void

    func makeCoordinator() -> Coordinator { Coordinator() }

    func makeNSView(context: Context) -> NSPopUpButton {
        let menu = NSPopUpButton(frame: .zero, pullsDown: false)
        menu.isBordered = true
        menu.focusRingType = .exterior
        return menu
    }

    func updateNSView(_ menu: NSPopUpButton, context: Context) {
        let coordinator = context.coordinator
        coordinator.action = action
        coordinator.kind = runtime.kind
        coordinator.menu = menu
        if menu.itemArray.map(\.title) != runtime.options.map(\.title)
            || menu.itemArray.map({ $0.representedObject as? String }) != runtime.options.map({ $0.id.rawValue }) {
            menu.removeAllItems()
            for option in runtime.options {
                menu.addItem(withTitle: option.title)
                let item = menu.lastItem!
                item.representedObject = option.id.rawValue
                item.target = coordinator
                item.action = #selector(Coordinator.select(_:))
            }
        }
        menu.font = font
        menu.setAccessibilityLabel("\(runtime.title): \(serviceLabel)")
        menu.setAccessibilityIdentifier("notes-\(runtime.id.rawValue)-kind")
        coordinator.restoreSelection()
    }

    @MainActor
    final class Coordinator: NSObject {
        var action: ((SettingsState.NotesRuntime.Kind) -> Void)?
        var kind: SettingsState.NotesRuntime.Kind?
        weak var menu: NSPopUpButton?

        func restoreSelection() {
            menu?.select(menu?.itemArray.first { $0.representedObject as? String == kind?.rawValue })
        }

        @objc func select(_ item: NSMenuItem) {
            guard let raw = item.representedObject as? String,
                  let kind = SettingsState.NotesRuntime.Kind(rawValue: raw) else { return }
            action?(kind)
            restoreSelection()
        }
    }
}

struct SettingsNotesText: NSViewRepresentable {
    var field: SettingsState.NotesField
    var slot: SettingsState.NotesRuntime.Slot
    var slotTitle: String
    var font: NSFont
    var color: NSColor
    var action: (String) -> Void

    func makeCoordinator() -> Coordinator { Coordinator() }

    func makeNSView(context: Context) -> SuppliedTextField {
        let input = SuppliedTextField()
        input.isBordered = false
        input.drawsBackground = false
        input.focusRingType = .exterior
        input.delegate = context.coordinator
        input.cell?.usesSingleLineMode = true
        input.cell?.isScrollable = true
        input.setContentCompressionResistancePriority(.defaultLow, for: .horizontal)
        return input
    }

    func updateNSView(_ input: SuppliedTextField, context: Context) {
        context.coordinator.action = action
        input.suppliedValue = field.value
        input.placeholderString = field.placeholder
        input.isEnabled = field.isEnabled
        input.isEditable = field.isEnabled
        input.isSelectable = field.isEnabled
        input.font = font
        input.textColor = color
        input.setAccessibilityLabel("\(slotTitle): \(field.label)")
        input.setAccessibilityIdentifier("notes-\(slot.rawValue)-\(field.id.rawValue)")
        // Reconcile only when the caller supplies a presentation. Invalidating
        // this view for an edit races the asynchronous reducer acknowledgement.
        input.reconcile()
    }

    @MainActor
    final class Coordinator: NSObject, NSTextFieldDelegate {
        var action: ((String) -> Void)?

        func controlTextDidBeginEditing(_ notification: Notification) {
            guard let input = notification.object as? SuppliedTextField,
                  let editor = input.currentEditor() as? NSTextView else { return }
            editor.isAutomaticTextReplacementEnabled = false
            editor.isAutomaticSpellingCorrectionEnabled = false
            editor.isAutomaticQuoteSubstitutionEnabled = false
            editor.isAutomaticDashSubstitutionEnabled = false
        }

        func controlTextDidChange(_ notification: Notification) {
            guard let input = notification.object as? SuppliedTextField, input.isEnabled else { return }
            action?(input.stringValue)
            if input.currentEditor() == nil { input.reconcile() }
        }
    }
}

final class SuppliedTextField: NSTextField {
    var suppliedValue = ""

    func reconcile() {
        let editor = currentEditor() as? NSTextView
        guard stringValue != suppliedValue || (editor != nil && editor?.string != suppliedValue) else { return }
        let selection = editor?.selectedRange()
        stringValue = suppliedValue
        if let editor {
            editor.string = suppliedValue
            if let selection {
                let end = (suppliedValue as NSString).length
                let location = min(selection.location, end)
                editor.setSelectedRange(NSRange(location: location, length: min(selection.length, end - location)))
            }
        }
    }

}
