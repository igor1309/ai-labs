import AppKit
import CallsListUI
import CallsWindowUI
import GlassLedger
import PreviewKit
import SummaryPreviewUI
import SwiftUI

/// The calls window as Audelin builds it, its toolbar and split included,
/// showing the list's and the summary's preview states, to try by hand.
@main
struct CallsPreviewApp: App {

    @State private var shown = CallsPreviewSelection()

    init() { PreviewApp.bringToFront() }

    var body: some Scene {

        Window("Calls preview", id: "controls") {

            CallsPreviewControls(shown: shown)
                .onAppear { CallsPreviewWindow.open(shown) }
        }
        .defaultSize(width: 300, height: 260)
    }
}

/// Which preview states the calls window shows, and in which appearance.
@MainActor @Observable
final class CallsPreviewSelection {

    var list = "calls"
    var summary: String? = "daily"
    var scheme: ColorScheme = .dark

    var listState: CallsListState { CallsListPreviews.state(list) }
    var summaryState: SummaryPreviewState? { summary.flatMap { SummaryPreviews.state($0) } }
}

struct CallsPreviewControls: View {

    let shown: CallsPreviewSelection

    var body: some View {

        @Bindable var shown = shown
        Form {

            Picker("Appearance", selection: $shown.scheme) {
                Text("Light").tag(ColorScheme.light)
                Text("Dark").tag(ColorScheme.dark)
            }
            .pickerStyle(.segmented)

            Picker("List", selection: $shown.list) {
                ForEach(CallsListPreviews.states.map(\.name), id: \.self) { Text($0).tag($0) }
            }

            Picker("Summary", selection: $shown.summary) {
                ForEach(SummaryPreviews.states.map(\.name), id: \.self) { Text($0).tag(Optional($0)) }
            }
        }
        .formStyle(.grouped)
    }
}

/// The calls window: the same split, toolbar and window chrome the app installs.
@MainActor
enum CallsPreviewWindow {

    private static var window: NSWindow?
    private static var toolbar: CallsToolbar?

    static func open(_ shown: CallsPreviewSelection) {

        guard window == nil else { return }
        let window = NSWindow(contentRect: NSRect(x: 0, y: 0, width: 1100, height: 720),
                              styleMask: [.titled, .closable, .miniaturizable, .resizable], backing: .buffered, defer: false)
        window.isReleasedWhenClosed = false
        let listText = CallsListText(language: .russian), text = SummaryPreviewText(language: .russian)
        let list = NSHostingView(rootView: CallsPreviewList(shown: shown, text: listText))
        let detail = NSHostingView(rootView: CallsPreviewDetail(shown: shown, text: text))
        let split = makeCallsSplit(list: list, detail: detail,
                                   defaults: UserDefaults(suiteName: "CallsPreview") ?? .standard)
        window.contentViewController = split
        window.setContentSize(NSSize(width: 1100, height: 720))
        let toolbar = CallsToolbar(identifier: "CallsPreviewToolbar", splitView: split.splitView,
                                   title: listText(.windowTitle), text: text, act: { _ in })
        installCallsToolbar(toolbar.toolbar, in: window)
        window.center()
        window.makeKeyAndOrderFront(nil)
        self.window = window
        self.toolbar = toolbar
        follow(shown)
    }

    /// Keeps the window's appearance and the toolbar's buttons on the states shown.
    private static func follow(_ shown: CallsPreviewSelection) {
        Task { @MainActor in
            for await (scheme, actions) in Observations({ (shown.scheme, callActions(shown.summaryState)) }) {
                window?.appearance = NSAppearance(named: scheme == .dark ? .darkAqua : .aqua)
                toolbar?.show(actions)
            }
        }
    }
}

struct CallsPreviewList: View {

    let shown: CallsPreviewSelection
    let text: CallsListText

    var body: some View {
        CallsListView(state: shown.listState, text: text, event: { _ in })
            .environment(\.colorScheme, shown.scheme)
    }
}

struct CallsPreviewDetail: View {

    let shown: CallsPreviewSelection
    let text: SummaryPreviewText

    var body: some View {
        SummaryPreviewView(state: shown.summaryState, text: text, event: { _ in }, render: renderNotes)
            .background(GlassLedger.for(shown.scheme).surface.ignoresSafeArea())
            .environment(\.colorScheme, shown.scheme)
    }
}
