import SwiftUI

/// Keeps section navigation above the scrolling settings page.
/// Offscreen previews use SettingsView to export the full page height.
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
        let content = SettingsView(state: state, event: event, config: config)
        let tokens = content.tokens

        VStack(spacing: 0) {
            content.tabs
                .padding(.horizontal, tokens.space24)
                .padding(.top, tokens.space24)
                .padding(.bottom, tokens.space16)
            ScrollView(.vertical) {
                VStack(alignment: .leading, spacing: tokens.space16) {
                    content.page
                }
                .padding(.horizontal, tokens.space24)
                .padding(.bottom, tokens.space24)
                .frame(width: config.windowWidth, alignment: .topLeading)
            }
        }
        .frame(width: config.windowWidth)
        .background(tokens.win)
        .overlay(alignment: .top) {
            if state.selectedTab == .recording, let confirm = state.moveConfirm {
                content.moveSheet(confirm)
            }
        }
    }
}
