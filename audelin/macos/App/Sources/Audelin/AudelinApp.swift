import SettingsUI
import CallsWindowUI
import SummaryPreviewUI
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
import CallsWindowShell
import os
import SwiftUI

@main
struct AudelinApp: App {

    @NSApplicationDelegateAdaptor(AudelinAppDelegate.self) private var appDelegate
    @State private var model: AudelinMenu?
    @State private var panel: FloatingPanel?
    @State private var settingsWindow: NSWindow?
    @State private var callsWindow: CallsWindow?
    @State private var callsWindows: CallsWindows?
    @State private var presence = WindowPresence(setPolicy: { NSApplication.shared.setActivationPolicy($0) })

    @MainActor
    private func start() async {

        guard model == nil else { return }
        let panel = FloatingPanel.onScreen()
        let presence = self.presence
        self.panel = panel
        var callsNSWindow: NSWindow?
        let callsWindow = CallsWindow(makeWindow: {
            let window = NSWindow(contentRect: NSRect(origin: .zero, size: CallsWindow.firstSize),
                                  styleMask: [.titled, .closable, .miniaturizable, .resizable], backing: .buffered, defer: false)
            window.setAccessibilityIdentifier("calls.window")
            presence.track(window)
            callsNSWindow = window
            return window
        }, title: CallsListText(language: .russian)(.windowTitle), activate: { NSApplication.shared.activate(ignoringOtherApps: true) }, shown: { presence.shown($0) })
        self.callsWindow = callsWindow
        let settingsWindow = SettingsWindow.make()
        settingsWindow.title = SettingsText(language: .russian)(.windowTitle)
        presence.track(settingsWindow)
        self.settingsWindow = settingsWindow
        let callWindow = CallWindowSlot()
        let boundary = await makeRealBoundary()
        let notifications = SystemNotifications(bundle: Bundle.main.bundleURL)
        let model = await compose(
            boundary: boundary,
            preferencesURL: FileManager.default.homeDirectoryForCurrentUser.appendingPathComponent(".audelin/preferences.json"),
            openCallsFolder: { NSWorkspace.shared.open($0) }, presentCalls: { callsWindow.show() },
            openURL: { NSWorkspace.shared.open($0) },
            presentPanel: { [weak panel] in panel?.setVisible($0) },
            terminate: { await MainActor.run { appDelegate.terminationReady = true; NSApplication.shared.terminate(nil) } },
            presentSettings: {
                presence.shown(settingsWindow)
                NSApplication.shared.activate(ignoringOtherApps: true)
                settingsWindow.deminiaturize(nil)
                settingsWindow.makeKeyAndOrderFront(nil)
            }, chooseCallsFolder: {
                let picker = NSOpenPanel()
                picker.canChooseDirectories = true; picker.canChooseFiles = false; picker.canCreateDirectories = true
                return try await presentPicker(
                    begin: { completion in picker.begin { completion($0 == .OK ? picker.url : nil) } },
                    isVisible: { picker.isVisible }
                )
            }, copyNotes: { copyNotes($0, to: .general) }, readCall: { if let window = callWindow.window { presentCall(window, shown: { presence.shown($0) }) } },
            notify: { notifications.post($0) }
        )
        self.model = model
        SettingsWindow.install(model, in: settingsWindow)
        observeLanguage(model, settingsWindow: settingsWindow, callsWindow: callsWindow)
        observeAppearance(model)
        if let calls = model.calls, let callsNSWindow {
            callsWindows = CallsWindows(model: model, calls: calls, window: callsWindow, nsWindow: callsNSWindow,
                                        callWindow: callWindow, track: { presence.track($0) })
        }
        panel.install(model)
        appDelegate.connect(model)
        let bundle = Bundle.main.bundleURL
        if bundle.pathExtension == "app" {
            installBrowserHost(appBundle: bundle)
            model.relaunchAfterUpdate(wait: { try await Task.sleep(for: .seconds(5)) }, replaced: bundleReplaced(at: bundle),
                                      relaunch: { try relaunchProcess(after: getpid(), bundle: bundle).run() })
        }
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
                    case .divider:
                        Divider()
                    case let .button(title, action):
                        Button(title, systemImage: action.symbol) { Task { await model.perform(action) } }
                            .keyboardShortcut(action == .quit ? KeyboardShortcut("q") : nil)
                    case let .toggle(title, checked, action):
                        Toggle(title, systemImage: action.symbol, isOn: Binding(
                            get: { checked }, set: { _ in Task { await model.perform(action) } }
                        ))
                    }
                }
                .disabled(model.quitting)
            }
        } label: {
            // Icon only: titles of different widths shifted the icon (LAB-640).
            MenuBarLabel(item: model?.menu.item)
                .task { await start() }
        }
        .commands {
            CommandGroup(replacing: .appSettings) {
                Button(settingsTitle) { Task { await model?.perform(.showSettings) } }
                    .keyboardShortcut(",")
                    .disabled(model == nil || model?.quitting == true)
            }
        }
    }

    /// AppKit's own title for the item, in the system's preferred language.
    /// The app ships no localizations, so the plain lookup would always pick English.
    private var settingsTitle: String {
        Bundle(for: NSApplication.self).localizedString(
            forKey: "Settings\\U2026", value: "Settings…", table: "MenuCommands",
            localizations: Locale.preferredLanguages.map { Locale.Language(identifier: $0) })
    }
}

/// The menu-bar icon. While recording it carries a steady red dot.
private struct MenuBarLabel: View {

    let item: MenuBarItem?

    var body: some View {
        Image(nsImage: image)
            .accessibilityLabel(item?.title ?? "Audelin")
    }

    private var image: NSImage {
        guard let item else {
            return NSImage(systemSymbolName: "waveform", accessibilityDescription: "Audelin") ?? NSImage()
        }
        let symbol = NSImage(systemSymbolName: item.symbol, accessibilityDescription: item.title) ?? NSImage()
        guard item.isRed else {
            symbol.isTemplate = true
            return symbol
        }
        return Self.badged(symbol)
    }

    /// The symbol with a 7 pt red dot over its top-right corner, the dot cut
    /// clear of the lines beneath it. Not a template: a template image loses
    /// its red in the menu bar. The symbol is tinted with the menu bar's own
    /// text colour at draw time, so it follows light and dark menu bars.
    private static func badged(_ symbol: NSImage) -> NSImage {
        let dot: CGFloat = 7, gap: CGFloat = 1.2, size = symbol.size
        let image = NSImage(size: size, flipped: false) { rect in
            let tinted = symbol.withSymbolConfiguration(.init(paletteColors: [.labelColor])) ?? symbol
            tinted.draw(in: rect)
            let spot = NSRect(x: rect.maxX - dot + 1, y: rect.maxY - dot + 1, width: dot, height: dot)
            NSGraphicsContext.current?.compositingOperation = .clear
            NSBezierPath(ovalIn: spot.insetBy(dx: -gap, dy: -gap)).fill()
            NSGraphicsContext.current?.compositingOperation = .sourceOver
            NSColor.systemRed.setFill()
            NSBezierPath(ovalIn: spot).fill()
            return true
        }
        image.isTemplate = false
        return image
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

/// Keeps the window titles in the language Audelin is shown in.
@MainActor
func observeLanguage(_ model: AudelinMenu, settingsWindow: NSWindow, callsWindow: CallsWindow) {
    Task { @MainActor in
        for await _ in Observations({ model.language }) {
            settingsWindow.title = model.settingsText(.windowTitle)
            callsWindow.retitle(model.callsListText(.windowTitle))
        }
    }
}

/// Forces light or dark on every window, the panel and the menu bar UI, or follows macOS.
@MainActor
func observeAppearance(_ model: AudelinMenu) {
    Task { @MainActor in
        for await appearance in Observations({ model.appearance }) {
            NSApplication.shared.appearance = switch appearance {
            case .system: nil
            case .light: NSAppearance(named: .aqua)
            case .dark: NSAppearance(named: .darkAqua)
            }
        }
    }
}

