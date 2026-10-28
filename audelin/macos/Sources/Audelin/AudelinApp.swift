import AppKit
import Compose
import MenuBar
import PanelUI
import Preferences
import os
import SwiftUI

@main
struct AudelinApp: App {

    @State private var model: AudelinMenu?
    @State private var panel: FloatingPanel?

    @MainActor
    private func start() async {

        guard model == nil else { return }
        let panel = FloatingPanel(makeWindow: {
            TranscriptPanel(contentRect: $0, styleMask: $1, backing: .buffered, defer: false)
        }, screenFrame: { NSScreen.main?.visibleFrame })
        self.panel = panel
        let model = await AudelinMenu(
            preferences: PreferencesStore(fileURL: FileManager.default.homeDirectoryForCurrentUser
                .appendingPathComponent(".audelin/preferences.json")),
            openCallsFolder: { NSWorkspace.shared.open($0) },
            presentPanel: { [weak panel] in panel?.setVisible($0) },
            terminate: { await MainActor.run { NSApplication.shared.terminate(nil) } }
        )
        self.model = model
        panel.install(content: NSHostingView(rootView: PanelContent(model: model)), onClose: { [weak model] in
            model?.panelClosed()
        })
    }

    init() {
        Logger(subsystem: "dev.igor1309.audelin", category: "menu").notice("app launched")
    }

    var body: some Scene {
        MenuBarExtra {
            if let model {
                ForEach(Array(model.menu.entries.enumerated()), id: \.offset) { _, entry in
                    switch entry {
                    case let .stateLine(line):
                        Text(line)
                        Divider()
                    case let .button(title, action):
                        Button(title) { Task { await model.perform(action) } }
                            .keyboardShortcut(action == .quit ? KeyboardShortcut("q") : nil)
                    case let .toggle(title, checked, action):
                        Toggle(title, isOn: Binding(
                            get: { checked }, set: { _ in Task { await model.perform(action) } }
                        ))
                    }
                }
                .disabled(model.quitting)
            }
        } label: {
            Label {
                Text(model?.menu.item.title ?? "Audelin")
            } icon: {
                Image(nsImage: menuBarImage)
            }
            .task { await start() }
        }
    }

    private var menuBarImage: NSImage {

        guard let item = model?.menu.item else {
            return NSImage(systemSymbolName: "waveform", accessibilityDescription: "Audelin") ?? NSImage()
        }
        let image = NSImage(systemSymbolName: item.symbol, accessibilityDescription: item.title)?
            .withSymbolConfiguration(.init(paletteColors: [item.isRed ? .systemRed : .labelColor]))
            ?? NSImage()
        // Template status images discard their palette in the menu bar.
        image.isTemplate = !item.isRed
        return image
    }
}

@MainActor
func panelContentBinding(_ model: AudelinMenu) -> (state: PanelState, event: (PanelEvent) -> Task<Void, Never>) {

    (model.panelState, { event in Task { await model.sendPanel(event) } })
}

private struct PanelContent: View {

    let model: AudelinMenu

    var body: some View {

        GeometryReader { geometry in
            let binding = panelContentBinding(model)
            PanelView(state: binding.state, event: { event in
                _ = binding.event(event)
            }, config: config(width: geometry.size.width))
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
        }
    }

    private func config(width: CGFloat) -> PanelConfig {

        var config = PanelConfig.glassLedger
        config.panelWidth = width
        return config
    }
}
