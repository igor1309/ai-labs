import AppKit
import Compose
import MenuBar
import Preferences
import os
import SwiftUI

@main
struct AudelinApp: App {

    @State private var model = AudelinMenu(
        preferences: PreferencesStore(fileURL: FileManager.default.homeDirectoryForCurrentUser
            .appendingPathComponent(".audelin/preferences.json")),
        openCallsFolder: { NSWorkspace.shared.open($0) },
        terminate: { await MainActor.run { NSApplication.shared.terminate(nil) } }
    )

    init() {
        Logger(subsystem: "dev.igor1309.audelin", category: "menu").notice("app launched")
    }

    var body: some Scene {
        MenuBarExtra {
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
        } label: {
            Label {
                Text(model.menu.item.title)
            } icon: {
                Image(nsImage: menuBarImage)
            }
        }
    }

    private var menuBarImage: NSImage {
        let item = model.menu.item
        let image = NSImage(systemSymbolName: item.symbol, accessibilityDescription: item.title)?
            .withSymbolConfiguration(.init(paletteColors: [item.isRed ? .systemRed : .labelColor]))
            ?? NSImage()
        // Template status images discard their palette in the menu bar.
        image.isTemplate = !item.isRed
        return image
    }
}
