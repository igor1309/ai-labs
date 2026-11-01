import SwiftUI

/// The host rail's current step and settings control in a compact header.
public struct CompactHostSteps: View {
    let steps: [SessionStep]
    let isSettingsEnabled: Bool
    let onSettings: () -> Void

    public init(_ steps: [SessionStep], isSettingsEnabled: Bool = true, onSettings: @escaping () -> Void) {
        self.steps = steps
        self.isSettingsEnabled = isSettingsEnabled
        self.onSettings = onSettings
    }

    public var body: some View {
        HStack(spacing: Tokens.space3) {
            if let index = currentStepIndex {
                let step = steps[index]
                HStack(spacing: Tokens.space2) {
                    Text("\(index + 1) / \(steps.count)").typeRole(.code)
                        .foregroundStyle(step.state == .failed ? Tokens.bad : Tokens.hostHi)
                    Text(step.title).typeRole(.label)
                        .foregroundStyle(step.state == .failed ? Tokens.bad : Tokens.hostHi)
                }
                .lineLimit(1)
                .padding(.horizontal, Tokens.space3)
                .padding(.vertical, Tokens.space2)
                .background(step.state == .failed ? Tokens.badTint : Tokens.hostTint, in: Capsule())
                .accessibilityElement(children: .combine)
                .accessibilityValue("\(step.detail), \(String(describing: step.state))")
            }
            Spacer(minLength: .zero)
            SettingsGear(isEnabled: isSettingsEnabled, action: onSettings)
        }
    }

    var currentStepIndex: Int? {
        steps.firstIndex { $0.state == .failed }
            ?? steps.firstIndex { $0.state == .active }
            ?? steps.lastIndex { $0.state == .done }
    }
}
