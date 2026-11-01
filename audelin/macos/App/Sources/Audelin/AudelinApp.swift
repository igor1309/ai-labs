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
    @State private var callsWindow: CallsWindow?

    @MainActor
    private func start() async {

        guard model == nil else { return }
        let panel = FloatingPanel(makeWindow: {
            TranscriptPanel(contentRect: $0, styleMask: $1, backing: .buffered, defer: false)
        }, screenFrame: { NSScreen.main?.visibleFrame })
        self.panel = panel
        let callsWindow = CallsWindow(makeWindow: {
            NSWindow(contentRect: NSRect(x: 0, y: 0, width: 1000, height: 560),
                     styleMask: [.titled, .closable, .miniaturizable, .resizable], backing: .buffered, defer: false)
        }, activate: { NSApplication.shared.activate() })
        self.callsWindow = callsWindow
        let access = await makeCallAudioAccess()
        let model = await AudelinMenu(
            preferences: PreferencesStore(fileURL: FileManager.default.homeDirectoryForCurrentUser
                .appendingPathComponent(".audelin/preferences.json")),
            access: access,
            openCallsFolder: { NSWorkspace.shared.open($0) },
            presentCalls: { callsWindow.show() },
            makeRecordings: makeRecordings,
            openURL: { NSWorkspace.shared.open($0) },
            presentPanel: { [weak panel] in panel?.setVisible($0) },
            terminate: { await MainActor.run { NSApplication.shared.terminate(nil) } },
            quit: quit,
            makeReading: makeReading,
            makeRecording: { initial, session, log, ready, released in
                await makeRecording(initial: initial, session: session, log: log,
                                    callAudioReady: ready, callAudioReleased: released)
            },
            makeSession: { await makeSession(handler: $0) }
        )
        self.model = model
        if let calls = model.calls { callsWindow.install(content: NSHostingView(rootView: CallsContent(model: calls))) }
        panel.install(content: NSHostingView(rootView: PanelContent(model: model)), onClose: { [weak model] in
            model?.panelClosed()
        })
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
final class AudelinAppDelegate: NSObject, NSApplicationDelegate {

    /// Unset while the app starts: a reopen then is the launch itself, and
    /// recording's state is not known yet to choose a window.
    var reopen: (() -> Void)?

    func connect(_ menu: AudelinMenu) {

        reopen = { [weak menu] in menu?.appReopened() }
    }

    func applicationShouldHandleReopen(_ sender: NSApplication, hasVisibleWindows flag: Bool) -> Bool {

        handleReopen()
        return true
    }

    /// Tests call this: touching `NSApplication.shared` there takes seconds on CI
    /// and holds the main actor.
    func handleReopen() { reopen?() }
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

private struct CallsContent: View {
    let model: AudelinCalls
    var body: some View {
        CallsListView(state: model.state, event: { event in Task { await model.send(event) } })
    }
}
