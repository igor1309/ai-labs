import AppKit
import SwiftUI

/// AppKit owns keyboard focus and accessibility actions while SwiftUI draws
/// the shared token-based button and checkbox labels.
struct SettingsPressTarget: NSViewRepresentable {
    var title: String
    var identifier: String?
    var isEnabled: Bool
    var checked: Bool? = nil
    var selected: Bool? = nil
    var action: () -> Void

    func makeCoordinator() -> Coordinator { Coordinator(action: action) }

    func makeNSView(context: Context) -> NSButton {
        let button = AccessiblePressButton(title: "", target: context.coordinator, action: #selector(Coordinator.press(_:)))
        button.isCheckbox = checked != nil
        button.setButtonType(checked == nil ? .momentaryPushIn : .switch)
        button.isBordered = false
        button.isTransparent = true
        button.focusRingType = .exterior
        return button
    }

    func updateNSView(_ button: NSButton, context: Context) {
        context.coordinator.action = action
        context.coordinator.checked = checked
        button.isEnabled = isEnabled
        button.state = checked == true ? .on : .off
        if let selected { button.setAccessibilitySelected(selected) }
        button.setAccessibilityElement(true)
        button.setAccessibilityLabel(title)
        button.setAccessibilityIdentifier(identifier)
    }

    @MainActor final class Coordinator: NSObject {
        var action: () -> Void
        var checked: Bool?
        init(action: @escaping () -> Void) { self.action = action }
        @objc func press(_ sender: NSButton) {
            if let checked { sender.state = checked ? .on : .off }
            action()
        }
    }
}

/// Transparent AppKit buttons need explicit AX semantics: their label is drawn
/// by SwiftUI, but the native control still owns focus and activation.
private final class AccessiblePressButton: NSButton {
    var isCheckbox = false
    override func accessibilityRole() -> NSAccessibility.Role? { isCheckbox ? .checkBox : .button }
    override func accessibilityValue() -> Any? { isCheckbox ? NSNumber(value: state == .on) : super.accessibilityValue() }
    override func accessibilityPerformPress() -> Bool {
        guard isEnabled else { return false }
        performClick(nil)
        return true
    }
}
