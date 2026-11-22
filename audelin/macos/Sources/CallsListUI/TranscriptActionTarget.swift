import AppKit
import SwiftUI

/// AppKit keeps a row's action reachable independently of its selection button.
struct TranscriptActionTarget: NSViewRepresentable {
    let title: String
    let identifier: String
    let action: () -> Void

    func makeCoordinator() -> Coordinator { Coordinator(action: action) }

    func makeNSView(context: Context) -> NSButton {
        let button = ActionButton(title: "", target: context.coordinator, action: #selector(Coordinator.press))
        button.isBordered = false
        button.isTransparent = true
        button.setButtonType(.momentaryPushIn)
        return button
    }

    func updateNSView(_ button: NSButton, context: Context) {
        context.coordinator.action = action
        button.setAccessibilityElement(true)
        button.setAccessibilityIdentifier(identifier)
        button.setAccessibilityLabel(title)
        button.setAccessibilityValue(title)
    }

    @MainActor final class Coordinator: NSObject {
        var action: () -> Void
        init(action: @escaping () -> Void) { self.action = action }
        @objc func press() { action() }
    }
}

private final class ActionButton: NSButton {
    override func accessibilityRole() -> NSAccessibility.Role? { .button }
    override func accessibilityPerformPress() -> Bool {
        guard isEnabled else { return false }
        performClick(nil)
        return true
    }
}
