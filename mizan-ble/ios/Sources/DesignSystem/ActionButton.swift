import SwiftUI

/// The one action button every screen uses: a label in the action style,
/// dimmed and inert while disabled.
public struct ActionButton<Icon: View>: View {

    let title: String
    let kind: ActionButtonStyle.Kind
    let isEnabled: Bool
    let action: () -> Void
    let icon: Icon

    @Environment(\.isEnabled) private var environmentIsEnabled

    private var enabled: Bool { isEnabled && environmentIsEnabled }

    public init(
        _ title: String, kind: ActionButtonStyle.Kind, isEnabled: Bool = true,
        action: @escaping () -> Void, @ViewBuilder icon: () -> Icon
    ) {

        self.title = title
        self.kind = kind
        self.isEnabled = isEnabled
        self.action = action
        self.icon = icon()
    }

    public var body: some View {

        Button {
            guard enabled else { return }
            action()
        } label: {
            // A new action in the same place crossfades its label instead of
            // replacing the button.
            ZStack {
                Label { Text(title) } icon: { icon }
                    .id(title)
                    .transition(.opacity)
            }
            // The button supplies disabled opacity; macOS must not dim the label again.
            .environment(\.isEnabled, true)
        }
        .buttonStyle(.action(kind))
        .disabled(!enabled)
        .allowsHitTesting(enabled)
        .opacity(enabled ? 1 : 0.4)
    }
}

public extension ActionButton where Icon == Image {

    init(
        _ title: String, systemImage: String, kind: ActionButtonStyle.Kind, isEnabled: Bool = true,
        action: @escaping () -> Void
    ) {

        self.init(title, kind: kind, isEnabled: isEnabled, action: action) { Image(systemName: systemImage) }
    }
}
