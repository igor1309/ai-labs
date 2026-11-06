import AppKit
import SwiftUI

/// AppKit owns keyboard focus and accessibility actions while SwiftUI draws
/// the shared token-based button and checkbox labels.
struct SettingsPressTarget: NSViewRepresentable {
    var title: String
    var identifier: String?
    var isEnabled: Bool
    var checked: Bool? = nil
    var action: () -> Void

    func makeCoordinator() -> Coordinator { Coordinator(action: action) }

    func makeNSView(context: Context) -> NSButton {
        let button = NSButton(title: "", target: context.coordinator, action: #selector(Coordinator.press(_:)))
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
        button.setAccessibilityElement(true)
        button.setAccessibilityLabel(title)
        button.setAccessibilityIdentifier(identifier)
    }

    final class Coordinator: NSObject {
        var action: () -> Void
        var checked: Bool?
        init(action: @escaping () -> Void) { self.action = action }
        @objc func press(_ sender: NSButton) {
            if let checked { sender.state = checked ? .on : .off }
            action()
        }
    }
}
