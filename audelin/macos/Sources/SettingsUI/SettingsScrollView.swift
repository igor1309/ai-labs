import SwiftUI

/// A scrollable host for future window composition. Offscreen previews use
/// SettingsView directly so their content is exported at its full height.
public struct SettingsScrollView: View {
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
    }
}
