import AppKit
import CallsListUI
import CallsWindowUI
import Composer
import SwiftUI

/// The calls window's list, detail and toolbar, and the call's own window,
/// built from the composed calls. It holds what the windows need to stay alive.
@MainActor
public final class CallsWindows {
    private let split: NSSplitViewController
    private let toolbars: [CallsToolbar]

    public init(model: AudelinMenu, calls: AudelinCalls, window: CallsWindow, nsWindow: NSWindow,
                callWindow: CallWindowSlot, track: (NSWindow) -> Void) {
        let act = detailSender { await calls.send(detail: $0) }
        let detail = NSHostingView(rootView: CallsDetailContent(model: calls, text: { model.previewText }))
        split = makeCallsSplit(list: NSHostingView(rootView: CallsContent(model: calls, focusDetail: { focusCallsDetail(in: detail) })),
                               detail: detail,
                               widthChanged: { calls.widthChanged(narrow: $0) })
        window.install(controller: split)
        let actions = CallsToolbar(identifier: "CallsToolbar", splitView: split.splitView, title: model.callsListText(.windowTitle), text: model.previewText, act: act)
        installCallsToolbar(actions.toolbar, in: nsWindow)
        let reading = CallsToolbar(identifier: "CallToolbar", text: model.previewText, act: act)
        let readingWindow = makeCallWindow(content: NSHostingView(rootView: CallsDetailContent(model: calls, text: { model.previewText })),
                                           title: { calls.detail?.title })
        readingWindow.toolbar = reading.toolbar
        readingWindow.toolbarStyle = .unified
        callWindow.window = readingWindow
        toolbars = [actions, reading]
        observeToolbars(model, calls: calls, toolbars: toolbars)
        track(readingWindow)
        onBothClosed(nsWindow, readingWindow, isVisible: { ($0 as? NSWindow)?.isVisible == true }, center: .default) {
            calls.windowClosed()
        }
    }
}

/// Keeps the toolbars' buttons on the call shown and their names in the language Audelin is shown in.
@MainActor
func observeToolbars(_ model: AudelinMenu, calls: AudelinCalls, toolbars: [CallsToolbar]) {
    Task { @MainActor in
        for await _ in Observations({ model.language }) {
            toolbars.forEach { $0.retitle(text: model.previewText, title: model.callsListText(.windowTitle)) }
        }
    }
    Task { @MainActor in
        for await actions in Observations({ callActions(detailState(calls.detail, text: model.previewText)) }) {
            toolbars.forEach { $0.show(actions) }
        }
    }
}

private struct CallsContent: View {
    let model: AudelinCalls
    let focusDetail: () -> Bool
    var body: some View {
        CallsListView(state: model.state, text: model.listText, event: { event in Task { await model.send(event) } }, focusDetail: focusDetail)
    }
}
