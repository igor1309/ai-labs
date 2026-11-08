import SwiftUI

/// The scrollable Settings window host. Offscreen previews use
/// SettingsView directly so their content is exported at its full height.
public struct SettingsScrollView: View {
    @Environment(\.colorScheme) private var scheme
    private let state: SettingsState
    private let event: (SettingsEvent) -> Void
    private let config: SettingsConfig

    public init(state: SettingsState, event: @escaping (SettingsEvent) -> Void,
                config: SettingsConfig = .glassLedger) {
        self.state = state
        self.event = event
        self.config = config
    }

    public var body: some View {
        ScrollView(.vertical) {
            SettingsView(state: state, event: event, config: config)
        }
        // Short pages leave part of the viewport uncovered by SettingsView.
        // Paint the host too, including after resizing or switching tabs.
        .background(config.tokens(for: scheme).win)
    }
}
