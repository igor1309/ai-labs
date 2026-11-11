import SwiftUI

/// Keeps section navigation above the scrolling settings page.
/// Offscreen previews use SettingsView to export the full page height.
public struct SettingsScrollView: View {
    private let state: SettingsState
    private let event: (SettingsEvent) -> Void
    private let config: SettingsConfig
    private let text: SettingsText
    private let contentHeightChanged: (CGFloat) -> Void

    public init(state: SettingsState, event: @escaping (SettingsEvent) -> Void,
                config: SettingsConfig = .glassLedger,
                text: SettingsText = .init(language: .russian),
                contentHeightChanged: @escaping (CGFloat) -> Void = { _ in }) {
        self.state = state
        self.event = event
        self.config = config
        self.text = text
        self.contentHeightChanged = contentHeightChanged
    }

    public var body: some View {
        var content = SettingsView(state: state, event: event, config: config, text: text)
        content.scrolls = true
        content.contentHeightChanged = contentHeightChanged
        return content
    }
}

extension SettingsView {
    var scrollingBody: some View {
        VStack(spacing: 0) {
            tabs
                .padding(.horizontal, tokens.space24)
                .padding(.top, tokens.space24)
                .padding(.bottom, tokens.space16)
                .onGeometryChange(for: CGFloat.self, of: { $0.size.height }) { tabsHeight = $0 }
            ScrollView(.vertical) {
                VStack(alignment: .leading, spacing: tokens.space16) {
                    page
                }
                .padding(.horizontal, tokens.space24)
                .padding(.bottom, tokens.space24)
                .frame(width: config.windowWidth, alignment: .topLeading)
                .onGeometryChange(for: CGFloat.self, of: { $0.size.height }) { pageHeight = $0 }
            }
        }
        .frame(width: config.windowWidth)
        .background(tokens.win)
        .onChange(of: tabsHeight + pageHeight) { _, height in
            if tabsHeight > 0, pageHeight > 0 { contentHeightChanged(height) }
        }
        .overlay(alignment: .top) {
            if state.selectedTab == .recording, let confirm = state.moveConfirm {
                moveSheet(confirm)
            }
        }
    }
}
