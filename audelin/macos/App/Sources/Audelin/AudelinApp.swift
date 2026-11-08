import GlassLedger
import SettingsUI
import CallsListUI
import Recordings
import AppKit
import CallAudioAccess
import CallAudioProbe
import Composer
import Lifecycle
import MenuBar
import PanelUI
import Preferences
import Reading
import Recording
import Session
import os
import SwiftUI

@main
struct AudelinApp: App {

    @NSApplicationDelegateAdaptor(AudelinAppDelegate.self) private var appDelegate
    @State private var model: AudelinMenu?
    @State private var panel: FloatingPanel?
    @State private var settingsWindow: NSWindow?
    @State private var callsWindow: CallsWindow?

    @MainActor
    private func start() async {

        guard model == nil else { return }
        let panel = FloatingPanel.onScreen()
        self.panel = panel
        let callsWindow = CallsWindow(makeWindow: {
            NSWindow(contentRect: NSRect(x: 0, y: 0, width: 1000, height: 560),
                     styleMask: [.titled, .closable, .miniaturizable, .resizable], backing: .buffered, defer: false)
        }, activate: { NSApplication.shared.activate() })
        self.callsWindow = callsWindow
        let settingsWindow = NSWindow(contentRect: NSRect(x: 0, y: 0, width: 668, height: 700),
                                      styleMask: [.titled, .closable, .miniaturizable, .resizable], backing: .buffered, defer: false)
        settingsWindow.title = "Настройки Audelin"
        settingsWindow.isReleasedWhenClosed = false
        settingsWindow.minSize = NSSize(width: 668, height: 400)
        settingsWindow.center()
        self.settingsWindow = settingsWindow
        let boundary = await makeRealBoundary()
        let model = await compose(
            boundary: boundary,
            preferencesURL: FileManager.default.homeDirectoryForCurrentUser.appendingPathComponent(".audelin/preferences.json"),
            openCallsFolder: { NSWorkspace.shared.open($0) }, presentCalls: { callsWindow.show() },
            openURL: { NSWorkspace.shared.open($0) },
            presentPanel: { [weak panel] in panel?.setVisible($0) },
            terminate: { await MainActor.run { appDelegate.terminationReady = true; NSApplication.shared.terminate(nil) } },
            presentSettings: {
                NSApplication.shared.activate()
                settingsWindow.deminiaturize(nil)
                settingsWindow.makeKeyAndOrderFront(nil)
            }, chooseCallsFolder: {
                let picker = NSOpenPanel()
                picker.canChooseDirectories = true; picker.canChooseFiles = false; picker.canCreateDirectories = true
                return await withCheckedContinuation { done in
                    picker.begin { result in done.resume(returning: result == .OK ? picker.url : nil) }
                }
            }, updates: await installedUpdates(runningBundle: Bundle.main.bundleURL, pid: ProcessInfo.processInfo.processIdentifier)
        )
        self.model = model
        settingsWindow.contentView = NSHostingView(rootView: SettingsContent(model: model))
        if let calls = model.calls { callsWindow.install(content: NSHostingView(rootView: CallsContent(model: calls))) }
        panel.install(model)
        appDelegate.connect(model)
    }

    init() {
        Logger(subsystem: "dev.igor1309.audelin", category: "menu").notice("app launched")
    }

    var body: some Scene {
        MenuBarExtra {
            if let model {
                ForEach(Array(model.menu.entries.enumerated()), id: \.offset) { _, entry in
                    switch entry {
                    case .separator: Divider()
                    case let .restart(title, reason):
                        Button { Task { await model.perform(.restartTapped) } } label: {
                            Label {
                                Text(title).foregroundStyle(reason == nil ? tokens.text : tokens.gutter)
                            } icon: {
                                Image(nsImage: MenuBarItem.updateDot(colour: NSColor(reason == nil ? tokens.me : tokens.gutter)))
                            }
                        }
                        .disabled(reason != nil)
                        if let reason {
                            Text(reason).font(.system(size: tokens.typeSmall)).foregroundStyle(tokens.gutter)
                        }
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
            // Icon only: titles of different widths shifted the icon (LAB-640).
            Image(nsImage: menuBarImage)
                .accessibilityLabel(model?.menu.item.title ?? "Audelin")
                .task { await start() }
        }
    }

    @Environment(\.colorScheme) private var scheme
    private var tokens: GlassLedger { .for(scheme) }

    private var menuBarImage: NSImage {

        guard let item = model?.menu.item else {
            return NSImage(systemSymbolName: "waveform", accessibilityDescription: "Audelin") ?? NSImage()
        }
        return item.image(updateBadge: model?.menu.updateBadge ?? false,
                          accent: NSColor(tokens.me))
    }
}

@MainActor
final class AudelinAppDelegate: NSObject, NSApplicationDelegate {

    /// Unset while the app starts: a reopen then is the launch itself, and
    /// recording's state is not known yet to choose a window.
    var reopen: (() -> Void)?
    var requestQuit: (() async -> Void)?
    var terminationReady = false
    private var quitRequested = false

    func connect(_ menu: AudelinMenu) {

        requestQuit = { [weak menu] in await menu?.perform(.quit) }
        if quitRequested { Task { await menu.perform(.quit) } }
        reopen = { [weak menu] in menu?.appReopened() }
    }

    func applicationShouldTerminate(_ sender: NSApplication) -> NSApplication.TerminateReply {
        guard !terminationReady else { return .terminateNow }
        quitRequested = true
        if let requestQuit { Task { await requestQuit() } }
        return .terminateCancel
    }

    func applicationShouldHandleReopen(_ sender: NSApplication, hasVisibleWindows flag: Bool) -> Bool {

        handleReopen()
        return true
    }

    /// Tests call this: touching `NSApplication.shared` there takes seconds on CI
    /// and holds the main actor.
    func handleReopen() { reopen?() }
}

private struct CallsContent: View {
    let model: AudelinCalls
    var body: some View {
        CallsListView(state: model.state, event: { event in Task { await model.send(event) } })
    }
}

private struct SettingsContent: View {
    let model: AudelinMenu
    var body: some View {
        SettingsScrollView(state: model.settingsState, event: { event in Task { await model.sendSettings(event) } })
            .disabled(model.quitting)
    }
}
