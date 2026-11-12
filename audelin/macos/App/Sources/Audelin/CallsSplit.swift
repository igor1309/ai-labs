import AppKit
import GlassLedger
import Composer
import NotesMarkdown
import SummaryPreviewUI
import SwiftUI

/// The calls window's two panes: the list at a width the divider sets, kept
/// across restarts, and the selected call's detail filling the rest. Tab moves
/// the keyboard from one pane to the other. Below 700 pt the detail hides, the
/// list fills the window, and `widthChanged` hears of each switch.
@MainActor
func makeCallsSplit(list: NSView, detail: NSView, defaults: UserDefaults = .standard,
                    widthChanged: @escaping (_ narrow: Bool) -> Void = { _ in }) -> NSSplitViewController {
    let split = CallsSplitController(defaults: defaults, widthChanged: widthChanged)
    split.splitView.isVertical = true
    split.splitView.dividerStyle = .thin
    let listItem = NSSplitViewItem(contentListWithViewController: hosting(list))
    listItem.titlebarSeparatorStyle = .line
    listItem.minimumThickness = CallsSplit.listRange.lowerBound
    listItem.maximumThickness = CallsSplit.listRange.upperBound
    listItem.holdingPriority = .init(260)
    listItem.canCollapse = false
    let detailItem = NSSplitViewItem(viewController: hosting(detail))
    detailItem.titlebarSeparatorStyle = .automatic
    detailItem.minimumThickness = CallsSplit.listRange.lowerBound
    detailItem.canCollapse = true
    split.addSplitViewItem(listItem)
    split.addSplitViewItem(detailItem)
    list.nextKeyView = detail
    detail.nextKeyView = list
    return split
}

/// Puts the divider where it was left, or at the list's own width, once the
/// window first lays it out wide, and saves each move from then on; hides and
/// shows the detail as the window crosses the narrow width.
final class CallsSplitController: NSSplitViewController {
    private let defaults: UserDefaults
    private let widthChanged: (Bool) -> Void
    private var placed = false
    private var narrow = false

    init(defaults: UserDefaults, widthChanged: @escaping (Bool) -> Void) {
        self.defaults = defaults
        self.widthChanged = widthChanged
        super.init(nibName: nil, bundle: nil)
    }

    @available(*, unavailable) required init?(coder: NSCoder) { fatalError("init(coder:) is not used") }

    override func viewDidLayout() {
        super.viewDidLayout()
        let width = view.bounds.width
        guard width > 0 else { return }
        if (width < CallsSplit.narrowBelow) != narrow { switchWidth(narrow: width < CallsSplit.narrowBelow) }
        guard !placed, !narrow else { return }
        placed = true
        let saved = defaults.object(forKey: CallsSplit.widthKey) as? Double
        splitView.setPosition(saved.map { CGFloat($0) } ?? CallsSplit.listWidth, ofDividerAt: 0)
    }

    /// A narrow window hides the detail and lets the list fill it; a wide one shows the detail again.
    private func switchWidth(narrow: Bool) {
        self.narrow = narrow
        let list = splitViewItems[0], detail = splitViewItems[1]
        list.maximumThickness = narrow ? NSSplitViewItem.unspecifiedDimension : CallsSplit.listRange.upperBound
        detail.isCollapsed = narrow
        if !narrow {
            let saved = defaults.object(forKey: CallsSplit.widthKey) as? Double
            splitView.setPosition(saved.map { CGFloat($0) } ?? CallsSplit.listWidth, ofDividerAt: 0)
        }
        widthChanged(narrow)
    }

    override func splitViewDidResizeSubviews(_ notification: Notification) {
        super.splitViewDidResizeSubviews(notification)
        guard placed, !narrow, let list = splitView.arrangedSubviews.first else { return }
        defaults.set(Double(list.frame.width), forKey: CallsSplit.widthKey)
    }
}

enum CallsSplit {
    static let listWidth: CGFloat = 340
    static let listRange: ClosedRange<CGFloat> = 280...420
    static let widthKey = "CallsSplit.listWidth"
    /// The window width below which the call beside the list hides.
    static let narrowBelow: CGFloat = 700
}

@MainActor
private func hosting(_ view: NSView) -> NSViewController {
    let controller = NSViewController()
    controller.view = view
    return controller
}

/// The detail as the summary view draws it; nil when no call is selected.
func detailState(_ detail: CallsDetail?, text: SummaryPreviewText) -> SummaryPreviewState? {
    guard let detail else { return nil }
    let notes: SummaryPreviewState.Notes, canRetry: Bool
    switch detail.content {
    case let .notes(source): notes = .markdown(source); canRetry = false
    case let .unreadable(reason): notes = .unreadable(text(.unreadable, reason)); canRetry = false
    case .preparing: notes = .preparing; canRetry = false
    case let .failed(reason, retry): notes = .failed(reason); canRetry = retry
    case let .none(notesOff): notes = .none(notesOff: notesOff); canRetry = false
    }
    return .init(title: detail.title, date: detail.date, duration: detail.duration, notes: notes, canRetry: canRetry)
}

/// The detail's buttons, as the calls window's actions on the call it shows.
func detailEvent(_ event: SummaryPreviewEvent) -> CallsDetailEvent {
    switch event {
    case .copy: .copy
    case .open: .open
    case .rename: .rename
    case .retrySummary: .retrySummary
    case .delete: .delete
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
        return SummaryPreviewView(state: detailState(model.detail, text: text), text: text,
                                  event: detailSender { await model.send(detail: $0) }, render: renderNotes)
            .background(GlassLedger.for(scheme).surface.ignoresSafeArea())
    }
}

/// The detail view's event handler: each button sent to the calls window as its action.
func detailSender(_ send: @escaping @MainActor (CallsDetailEvent) async -> Void) -> (SummaryPreviewEvent) -> Void {
    { event in Task { @MainActor in await send(detailEvent(event)) } }
}

/// Tells the calls list when its window closes.
@MainActor
func onClose(of window: AnyObject, center: NotificationCenter, _ closed: @escaping @MainActor () -> Void) {
    center.addObserver(forName: NSWindow.willCloseNotification, object: window, queue: .main) { _ in
        MainActor.assumeIsolated { closed() }
    }
}

/// The detail's notes, rendered from Markdown in the view's style.
func renderNotes(_ source: String, _ style: NotesStyle) -> NSAttributedString {
    NotesMarkdown.render(source, style: .init(body: style.body, headings: style.headings, code: style.code, text: style.text,
                                              secondary: style.secondary, tertiary: style.tertiary, codeBackground: style.codeBackground, rule: style.rule,
                                              layout: .init(lineHeight: style.lineHeight, paragraphSpacing: style.paragraphSpacing,
                                                            headingSpacing: style.headingSpacing, labelLevels: style.labelLevels,
                                                            labelKern: style.labelKern)))
}

/// Puts the notes' Markdown on the pasteboard as plain text.
func copyNotes(_ markdown: String, to pasteboard: NSPasteboard) {
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
func presentCall(_ window: any CallsWindowDriver, shown: (AnyObject) -> Void) {
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
@MainActor final class CallWindowSlot { var window: NSWindow? }

/// Split sections keep independent titlebar surfaces and the system's scrolling pocket.
@MainActor
func installCallsToolbar(_ toolbar: NSToolbar, in window: NSWindow) {
    window.styleMask.insert(.fullSizeContentView)
    window.titlebarAppearsTransparent = true
    window.titlebarSeparatorStyle = .automatic
    window.titleVisibility = .hidden
    window.toolbarStyle = .unified
    window.toolbar = toolbar
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
