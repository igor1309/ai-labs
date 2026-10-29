import CallsListUI
import Recordings
import AppKit
import CallAudioAccess
import CallAudioProbe
import Compose
import IMRxObservation
import Lifecycle
import MenuBar
import PanelUI
import Preferences
import Reading
import Recording
import Session
import os
import SwiftUI
import Synchronization

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
        appDelegate.reopen = { [weak model] in model?.appReopened() }
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

    var reopen: (() -> Void)? {
        didSet {
            if pendingReopen, let reopen {
                pendingReopen = false
                reopen()
            }
        }
    }
    private var pendingReopen = false

    func applicationShouldHandleReopen(_ sender: NSApplication, hasVisibleWindows flag: Bool) -> Bool {

        if let reopen { reopen() }
        else { pendingReopen = true }
        return true
    }
}

/// Each recording's reading model, reducing on the main actor.
@MainActor
func makeReading() -> ReadingInputs {

    let model = ObservableModel<ReadingState, ReadingEvent, Never>(
        initialState: .init(), reduce: ReadingReducer.reduce, handleEffect: { switch $0 {} }
    )
    return ReadingInputs(state: { model.state }, send: { model.event($0) })
}

/// Recording's model, reducing on the main actor, and the doer that makes the Session follow it.
@MainActor
func makeRecording(
    initial: RecordingState, session: any RecordingSession, log: @escaping @Sendable (RecordingState) -> Void,
    callAudioReady: @escaping @Sendable () async -> Bool,
    callAudioReleased: @escaping @Sendable () async -> Void
) -> RecordingInputs {

    let model = RecordingModel(initial: initial, log: log)
    let doer = RecordingDoer(session: session, callAudioReady: callAudioReady,
                             callAudioReleased: callAudioReleased, send: { await model.send($0) })
    let acting = Task { for await state in model.states() { doer.act(on: state) } }
    return RecordingInputs(
        send: { await model.send($0) },
        state: { await model.state },
        states: { await model.states() },
        end: { acting.cancel(); await model.end() }
    )
}

/// Holds the sync model on the main actor; callers elsewhere await the hop.
@MainActor
final class RecordingModel {

    private let model: SyncModel<RecordingState, RecordingEvent>
    private let feed = StateFeed<RecordingState>()

    init(initial: RecordingState, log: @escaping @Sendable (RecordingState) -> Void) {

        let feed = feed
        model = SyncModel(initialState: initial, reduce: { state, event in
            guard !feed.finished else { return state }
            let next = RecordingReducer.reduce(state, event)
            if next != state {
                log(next)
                feed.publish(next)
            }
            return next
        })
    }

    var state: RecordingState { model.state }

    func send(_ event: RecordingEvent) { model.event(event) }

    /// Starts with the current state and retains every change.
    func states() -> AsyncStream<RecordingState> { feed.subscribe(from: model.state) }

    /// Finishes every states stream; later ones finish at once and later events change nothing.
    func end() { feed.finish() }
}

/// One Session's model, reducing on its own actor and running its effects through the handler.
func makeSession(handler: SessionEffectHandler) async -> SessionInputs {

    let model = SessionModel()
    await model.start(handler: handler)
    return SessionInputs(
        send: { await model.send($0) },
        states: { await model.states() },
        end: { await model.end() }
    )
}

/// Holds the observable model on its own actor, off the main actor; callers await the hop.
actor SessionModel {

    private var model: ObservableModel<SessionState, SessionEvent, SessionEffect>?
    // The state kept when the model is released at the end.
    private var ended: SessionState?
    private let feed = StateFeed<SessionState>()

    func start(handler: SessionEffectHandler, initial: SessionState = .init()) {

        let feed = feed
        model = ObservableModel(initialState: initial, reduce: { state, event in
            guard !feed.finished else { return (state, nil) }
            let (next, effect) = SessionReducer.reduce(state, event)
            if next != state { feed.publish(next) }
            return (next, effect)
        }, handleEffect: { effect in
            AsyncStream { events in
                let task = Task {
                    events.yield(await handler.handle(effect))
                    events.finish()
                }
                events.onTermination = { _ in task.cancel() }
            }
        }, isolation: self)
    }

    func send(_ event: SessionEvent) { model?.event(event) }

    /// Starts with the current state and retains every change.
    func states() -> AsyncStream<SessionState> { feed.subscribe(from: model?.state ?? ended ?? .init()) }

    /// Finishes every states stream; later ones finish at once and later events change nothing.
    func end() {
        feed.finish()
        // The model's loop holds this actor, so the model is released to end both.
        ended = model?.state
        model = nil
    }
}

/// Returns once the lifecycle has terminated: every begun session has ended first.
@MainActor
func quit(_ handler: LifecycleEffectHandler) async {

    let model = ObservableModel(initialState: LifecycleState.running, reduce: LifecycleReducer.reduce, handleEffect: handler.handle)
    model.event(.quit)
    for await state in Observations({ model.state }) where state == .terminated { break }
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

@MainActor
func makeRecordings(handler: RecordingsEffectHandler) -> RecordingsInputs {
    let model = ObservableModel(initialState: RecordingsState(), reduce: RecordingsReducer.reduce,
                                handleEffect: { handleRecordingsEffect(handler, $0) })
    return RecordingsInputs(state: { model.state }, send: { model.event($0) })
}

private struct CallsContent: View {
    let model: AudelinCalls
    var body: some View {
        CallsListView(state: model.state, event: { event in Task { await model.send(event) } })
    }
}
