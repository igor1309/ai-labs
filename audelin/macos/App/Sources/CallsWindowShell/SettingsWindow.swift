import AppKit
import Composer
import SettingsUI
import SwiftUI

/// The Settings window both the app and the calls rehearsal show: as wide as
/// the page, and as tall as the selected tab up to the screen.
@MainActor
public enum SettingsWindow {

    /// The window before the model exists, so `presentSettings` can capture it.
    public static func make() -> NSWindow {
        let width = SettingsConfig.glassLedger.windowWidth
        let window = NSWindow(contentRect: NSRect(x: 0, y: 0, width: width, height: 700),
                              styleMask: [.titled, .closable, .miniaturizable, .resizable], backing: .buffered, defer: false)
        window.isReleasedWhenClosed = false
        window.contentMinSize = NSSize(width: width, height: 120)
        window.contentMaxSize = NSSize(width: width, height: .greatestFiniteMagnitude)
        window.setAccessibilityIdentifier("settings.window")
        window.center()
        return window
    }

    /// Fills the window with the model's Settings page.
    public static func install(_ model: AudelinMenu, in window: NSWindow) {
        window.title = model.settingsText(.windowTitle)
        window.contentView = NSHostingView(rootView: SettingsContent(model: model, window: window))
    }
}

private struct SettingsContent: View {
    let model: AudelinMenu
    let window: NSWindow
    var body: some View {
        SettingsScrollView(state: model.settingsState, event: { event in Task { await model.sendSettings(event) } },
                           text: model.settingsText,
                           contentHeightChanged: { height in
            // Keep the title bar in place when a tab or its contents changes height.
            let visible = window.screen?.visibleFrame ?? NSScreen.main?.visibleFrame ?? window.frame
            let chrome = window.frame.height - window.contentLayoutRect.height
            let targetHeight = min(height + chrome, visible.height)
            var frame = window.frame
            frame.origin.y += frame.height - targetHeight
            frame.size.height = targetHeight
            frame.origin.y = max(visible.minY, min(frame.origin.y, visible.maxY - targetHeight))
            window.setFrame(frame, display: true)
        })
            .disabled(model.quitting)
    }
}
