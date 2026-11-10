import AppKit
import Composer
import SummaryPreviewUI
import SwiftUI

@MainActor
protocol PreviewPanelDriver: AnyObject {
    var title: String { get set }
    var contentView: NSView? { get set }
    func orderFront(_ sender: Any?)
    func orderOut(_ sender: Any?)
}

extension NSPanel: PreviewPanelDriver {}

/// The summary preview's window: shown while there is a preview, with that
/// call's notes, and ordered out while there is none.
@MainActor
final class PreviewPanel {
    private let panel: any PreviewPanelDriver
    private let copy: (String) -> Void

    init(makePanel: () -> any PreviewPanelDriver, copy: @escaping (String) -> Void) {
        panel = makePanel()
        self.copy = copy
    }

    /// Each preview brings the panel forward, so an eye finds it behind
    /// another Audelin window.
    func show(_ preview: CallsPreview?) {
        guard let preview else { panel.orderOut(nil); return }
        let notes: SummaryPreviewState.Notes
        switch preview.notes {
        case let .text(markdown): notes = .markdown(markdown)
        case let .unreadable(reason): notes = .unreadable("Заметки не читаются: \(reason)")
        }
        let state = SummaryPreviewState(title: preview.title, date: preview.date, duration: preview.duration, notes: notes)
        panel.title = "Саммари — \(preview.title)"
        let copy = self.copy
        let view = SummaryPreviewView(state: state) { if case let .markdown(source) = notes { copy(source) } }
        if let host = panel.contentView as? NSHostingView<SummaryPreviewView> { host.rootView = view }
        else { panel.contentView = NSHostingView(rootView: view) }
        panel.orderFront(nil)
    }
}

/// The utility panel the preview lives in: it floats above the calls list,
/// hides while another app is active, and keeps its frame across restarts.
@MainActor
func makeSummaryPanel() -> NSPanel {
    let panel = NSPanel(contentRect: NSRect(x: 0, y: 0, width: 440, height: 560),
                        styleMask: [.titled, .closable, .resizable, .utilityWindow], backing: .buffered, defer: true)
    panel.isFloatingPanel = true
    panel.hidesOnDeactivate = true
    panel.becomesKeyOnlyIfNeeded = true
    panel.isReleasedWhenClosed = false
    panel.minSize = NSSize(width: 320, height: 240)
    panel.center()
    panel.setFrameAutosaveName("SummaryPreview")
    return panel
}

/// Puts the notes' Markdown on the pasteboard as plain text.
func copyNotes(_ markdown: String, to pasteboard: NSPasteboard) {
    pasteboard.clearContents()
    pasteboard.setString(markdown, forType: .string)
}
