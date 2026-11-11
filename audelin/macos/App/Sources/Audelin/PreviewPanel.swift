import AppKit
import Composer
import NotesMarkdown
import SummaryPreviewUI
import SwiftUI

@MainActor
protocol PreviewPanelDriver: AnyObject {
    var title: String { get set }
    var contentView: NSView? { get set }
    func orderFront(_ sender: Any?)
    func makeKeyAndOrderFront(_ sender: Any?)
    func orderOut(_ sender: Any?)
}

extension NSPanel: PreviewPanelDriver {}

/// The summary preview's window: shown while there is a preview, with that
/// call's notes, and ordered out while there is none.
@MainActor
final class PreviewPanel {
    private let panel: any PreviewPanelDriver
    private let copy: (String) -> Void
    private let makeContent: (SummaryPreviewState, SummaryPreviewText, @escaping () -> Void) -> NSView
    private var shown: CallsPreview?
    private var focusDue = false
    private var text: SummaryPreviewText

    init(makePanel: () -> any PreviewPanelDriver, text: SummaryPreviewText, copy: @escaping (String) -> Void,
         makeContent: @escaping (SummaryPreviewState, SummaryPreviewText, @escaping () -> Void) -> NSView) {
        panel = makePanel()
        self.text = text
        self.copy = copy
        self.makeContent = makeContent
    }

    /// Each preview brings the panel forward, so it is found behind another
    /// Audelin window; after an eye it also becomes the active window.
    func show(_ preview: CallsPreview?) {
        guard let preview else { shown = nil; focusDue = false; panel.orderOut(nil); return }
        fill(preview)
        shown = preview
        if focusDue { focusDue = false; panel.makeKeyAndOrderFront(nil) } else { panel.orderFront(nil) }
    }

    /// Writes the shown preview again in the new language, where it already is.
    func languageChanged(_ text: SummaryPreviewText) {
        self.text = text
        if let shown { fill(shown) }
    }

    private func fill(_ preview: CallsPreview) {
        let notes: SummaryPreviewState.Notes
        switch preview.notes {
        case let .text(markdown): notes = .markdown(markdown)
        case let .unreadable(reason): notes = .unreadable(text(.unreadable, reason))
        }
        let state = SummaryPreviewState(title: preview.title, date: preview.date, duration: preview.duration, notes: notes)
        panel.title = text(.windowTitle, preview.title)
        let copy = self.copy
        panel.contentView = makeContent(state, text) { if case let .markdown(source) = notes { copy(source) } }
    }

    /// An eye: the panel becomes the active window, now if it shows the
    /// call already, or as the eye's preview arrives.
    func focus() {
        if shown != nil { panel.makeKeyAndOrderFront(nil) } else { focusDue = true }
    }
}

/// Connects the panel to the calls list: it follows the list's preview, its
/// own close closes the preview, and closing the calls window closes it too.
@MainActor
func connectPreview(panel: PreviewPanel, preview: @escaping @MainActor () -> CallsPreview?,
                    panelWindow: AnyObject, callsWindow: AnyObject?, center: NotificationCenter,
                    closePreview: @escaping @MainActor () -> Void, windowClosed: @escaping @MainActor () -> Void) -> Task<Void, Never> {
    center.addObserver(forName: NSWindow.willCloseNotification, object: panelWindow, queue: .main) { _ in
        MainActor.assumeIsolated { closePreview() }
    }
    if let callsWindow {
        center.addObserver(forName: NSWindow.willCloseNotification, object: callsWindow, queue: .main) { _ in
            MainActor.assumeIsolated { windowClosed() }
        }
    }
    return Task { @MainActor in
        for await current in Observations({ preview() }) { panel.show(current) }
    }
}

/// The floating panel the preview lives in, with a standard title bar: it floats above the calls list,
/// hides while another app is active, and keeps its frame across restarts.
@MainActor
func makeSummaryPanel() -> NSPanel {
    let panel = NSPanel(contentRect: NSRect(x: 0, y: 0, width: 440, height: 560),
                        styleMask: [.titled, .closable, .resizable], backing: .buffered, defer: true)
    panel.isFloatingPanel = true
    panel.hidesOnDeactivate = true
    panel.isReleasedWhenClosed = false
    panel.minSize = NSSize(width: 320, height: 240)
    panel.center()
    panel.setFrameAutosaveName("SummaryPreview")
    return panel
}

/// The panel's content: the preview view of one call.
@MainActor
func summaryContent(_ state: SummaryPreviewState, text: SummaryPreviewText, copy: @escaping () -> Void) -> NSView {
    NSHostingView(rootView: SummaryPreviewView(state: state, text: text, copy: copy, render: renderNotes))
}

/// The preview's notes, rendered from Markdown in the view's style.
func renderNotes(_ source: String, _ style: NotesStyle) -> NSAttributedString {
    NotesMarkdown.render(source, style: .init(body: style.body, headings: style.headings, code: style.code, text: style.text,
                                              secondary: style.secondary, codeBackground: style.codeBackground, rule: style.rule,
                                              layout: .init(lineHeight: style.lineHeight, paragraphSpacing: style.paragraphSpacing,
                                                            headingSpacing: style.headingSpacing, labelLevels: style.labelLevels,
                                                            labelKern: style.labelKern)))
}

/// Puts the notes' Markdown on the pasteboard as plain text.
func copyNotes(_ markdown: String, to pasteboard: NSPasteboard) {
    pasteboard.clearContents()
    pasteboard.setString(markdown, forType: .string)
}
