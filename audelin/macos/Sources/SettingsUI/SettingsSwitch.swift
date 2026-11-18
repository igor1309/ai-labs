import AppKit
import SwiftUI

/// The native on/off switch System Settings uses. It shows the state it is
/// given: a click reports the flipped value and puts the switch back until a
/// new state arrives.
struct SettingsSwitch: NSViewRepresentable {
    var title: String
    var identifier: String
    var isOn: Bool
    var set: (Bool) -> Void

    func makeCoordinator() -> Coordinator { Coordinator(set: set) }

    func makeNSView(context: Context) -> NSSwitch {
        let control = NSSwitch()
        control.controlSize = .small
        control.target = context.coordinator
        control.action = #selector(Coordinator.flip(_:))
        control.setContentHuggingPriority(.required, for: .horizontal)
        return control
    }

    func updateNSView(_ control: NSSwitch, context: Context) {
        context.coordinator.set = set
        context.coordinator.isOn = isOn
        control.state = isOn ? .on : .off
        control.setAccessibilityLabel(title)
        control.setAccessibilityIdentifier(identifier)
    }

    @MainActor final class Coordinator: NSObject {
        var set: (Bool) -> Void
        var isOn = false
        init(set: @escaping (Bool) -> Void) { self.set = set }
        @objc func flip(_ sender: NSSwitch) {
            sender.state = isOn ? .on : .off
            set(!isOn)
        }
    }
}
