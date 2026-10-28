import AppKit
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
            terminate: { await MainActor.run { NSApplication.shared.terminate(nil) } },
            quit: quit,
            makeReading: makeReading,
            makeRecording: { await makeRecording(initial: $0, session: $1, log: $2) },
            makeSession: { await makeSession(handler: $0) }
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
    initial: RecordingState, session: any RecordingSession, log: @escaping @Sendable (RecordingState) -> Void
) -> RecordingInputs {

    let model = RecordingModel(initial: initial, log: log)
    let doer = RecordingDoer(session: session, send: { await model.send($0) })
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

/// One Session's model, reducing on the main actor and running its effects through the handler.
@MainActor
func makeSession(handler: SessionEffectHandler) -> SessionInputs {

    let model = SessionModel(handler: handler)
    return SessionInputs(
        send: { await model.send($0) },
        states: { await model.states() },
        end: { await model.end() }
    )
}

/// Holds the observable model on the main actor; callers elsewhere await the hop.
@MainActor
final class SessionModel {

    private let model: ObservableModel<SessionState, SessionEvent, SessionEffect>
    private let feed = StateFeed<SessionState>()

    init(handler: SessionEffectHandler, initial: SessionState = .init()) {

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
        })
    }

    func send(_ event: SessionEvent) { model.event(event) }

    /// Starts with the current state and retains every change.
    func states() -> AsyncStream<SessionState> { feed.subscribe(from: model.state) }

    /// Finishes every states stream; later ones finish at once and later events change nothing.
    func end() { feed.finish() }
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
