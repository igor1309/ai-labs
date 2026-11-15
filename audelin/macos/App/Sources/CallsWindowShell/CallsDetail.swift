import CallDetail
import NotesMenu
import AppKit
import GlassLedger
import CallsWindowUI
import Composer
import SummaryPreviewUI
import SwiftUI

/// The detail as the summary view draws it; nil when no call is selected.
func detailState(_ detail: CallsDetail?, tags: CallsDetailTags = .shown([]), menu: NotesMenuState? = nil, text: SummaryPreviewText) -> SummaryPreviewState? {
    guard let detail else { return nil }
    let notes: SummaryPreviewState.Notes, canRetry: Bool
    switch detail.content {
    case let .notes(source, made): notes = .markdown(source, made: made); canRetry = false
    case let .unreadable(reason): notes = .unreadable(text(.unreadable, reason)); canRetry = false
    case .preparing: notes = .making; canRetry = false
    case let .failed(reason, retry): notes = .failed(reason); canRetry = retry
    case .none: notes = .none; canRetry = false
    }
    let line: SummaryPreviewState.Tags
    switch tags {
    case let .shown(names): line = .shown(names)
    case let .editing(names, entry, completion, saving, failure):
        line = .editing(.init(tags: names, entry: entry, completion: completion, saving: saving, failure: failure))
    }
    return .init(title: detail.title, date: detail.date, duration: detail.duration, notes: notes, canRetry: canRetry, tags: line,
                 menu: menu.map { .init(section: $0.section, templates: $0.templates.map { .init(id: $0.id, name: $0.name, enabled: $0.enabled) },
                                       keeping: $0.offersKeeping ? $0.keeping : nil, saving: $0.saving, failure: $0.saveFailure, catalogueRevision: $0.catalogueRevision) },
                 version: detail.pair?.previous == nil ? nil : (detail.version == .previous ? .previous : .current),
                 templateName: detail.template, progress: detail.progress, failure: detail.failure)
}

/// The detail's buttons, as the calls window's actions on the call it shows.
func detailEvent(_ event: SummaryPreviewEvent) -> CallsDetailEvent? {
    switch event {
    case .openNotesMenu: .notesMenuOpened
    case let .chooseTemplate(template): .chooseNotesTemplate(template)
    case .toggleKeeping: .toggleKeeping
    case let .chooseVersion(version): .chooseNotesVersion(version == .previous ? .previous : .current)
    case .makeSummary: .makeSummary
    case .cancelSummary: .cancelNotes
    case .copy: .copy
    case .open: .open
    case .rename: .rename
    case .retrySummary: .retrySummary
    case .delete: .delete
    case .editTags: .editTags
    case let .typeTag(text): .typeTag(text)
    case .completeTag: .completeTag
    case let .removeTag(tag): .removeTag(tag)
    case .submitTags: .submitTags
    case .cancelTags: .cancelTags
    }
}

/// The selected call beside the list.
struct CallsDetailContent: View {
    let model: AudelinCalls
    let text: () -> SummaryPreviewText
    @Environment(\.colorScheme) private var scheme
    var body: some View {
        let text = text()
        // The summary's surface runs up under the window's transparent toolbar.
        return SummaryPreviewView(state: detailState(model.detail, tags: model.detailTags, menu: model.notesMenu, text: text), text: text,
                                  event: detailSender { await model.send(detail: $0) }, render: renderNotes)
            .background(GlassLedger.for(scheme).surface.ignoresSafeArea())
    }
}

/// The detail view's event handler: each button sent to the calls window as its action.
func detailSender(_ send: @escaping @MainActor (CallsDetailEvent) async -> Void) -> (SummaryPreviewEvent) -> Void {
    { event in guard let event = detailEvent(event) else { return }; Task { @MainActor in await send(event) } }
}

/// Tells the calls list when its window closes.
@MainActor
func onClose(of window: AnyObject, center: NotificationCenter, _ closed: @escaping @MainActor () -> Void) {
    center.addObserver(forName: NSWindow.willCloseNotification, object: window, queue: .main) { _ in
        MainActor.assumeIsolated { closed() }
    }
}

/// Puts the notes' Markdown on the pasteboard as plain text.
public func copyNotes(_ markdown: String, to pasteboard: NSPasteboard) {
    pasteboard.clearContents()
    pasteboard.setString(markdown, forType: .string)
}

/// The selected call in its own window, for a calls window too narrow to show it beside the list.
/// It keeps its frame across restarts and its title follows the call it shows.
@MainActor
func makeCallWindow(content: NSView, title: @escaping @MainActor () -> String?) -> NSWindow {
    let window = NSWindow(contentRect: NSRect(x: 0, y: 0, width: 440, height: 560),
                          styleMask: [.titled, .closable, .miniaturizable, .resizable], backing: .buffered, defer: true)
    window.isReleasedWhenClosed = false
    window.minSize = NSSize(width: 320, height: 240)
    window.center()
    window.setFrameAutosaveName("CallWindow")
    window.contentView = content
    followTitle(title) { [weak window] in window?.title = $0 }
    return window
}

/// Sets each title the call's window should carry, empty with no call.
@MainActor @discardableResult
func followTitle(_ title: @escaping @MainActor () -> String?, set: @escaping @MainActor (String) -> Void) -> Task<Void, Never> {
    Task { @MainActor in
        for await current in Observations({ title() }) { set(current ?? "") }
    }
}

/// Brings the call's window forward, from the Dock too, and tells the app a window is shown.
@MainActor
public func presentCall(_ window: any CallsWindowDriver, shown: (AnyObject) -> Void) {
    if window.isMiniaturized { window.deminiaturize(nil) }
    shown(window)
    window.makeKeyAndOrderFront(nil)
}

/// The calls list stops watching for notes only once both the calls window and the call's own window are closed.
@MainActor
func onBothClosed(_ first: AnyObject, _ second: AnyObject, isVisible: @escaping @MainActor (AnyObject) -> Bool,
                  center: NotificationCenter, _ closed: @escaping @MainActor () -> Void) {
    onClose(of: first, center: center) { if !isVisible(second) { closed() } }
    onClose(of: second, center: center) { if !isVisible(first) { closed() } }
}

/// Holds the call's window, made once the calls list exists, for the list's Return and Space.
@MainActor public final class CallWindowSlot {
    public var window: NSWindow?
    public init() {}
}

/// Crosses the hosting boundary explicitly; a native field editor owns Tab while searching.
@MainActor
func focusCallsDetail(in detail: NSView) -> Bool {
    guard !detail.isHiddenOrHasHiddenAncestor else { return false }
    func textView(in view: NSView) -> NSTextView? {
        (view as? NSTextView) ?? view.subviews.lazy.compactMap { textView(in: $0) }.first
    }
    return detail.window?.makeFirstResponder(textView(in: detail) ?? detail) == true
}
