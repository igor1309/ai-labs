import AppKit
import NotesMarkdown
import SummaryPreviewUI

/// The calls window's two panes: the list at a width the divider sets, kept
/// across restarts, and the selected call's detail filling the rest. Tab moves
/// the keyboard from one pane to the other. Below 700 pt the detail hides, the
/// list fills the window, and `widthChanged` hears of each switch.
@MainActor
public func makeCallsSplit(list: NSView, detail: NSView, defaults: UserDefaults = .standard,
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
public final class CallsSplitController: NSSplitViewController {
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

    override public func viewDidLayout() {
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

    override public func splitViewDidResizeSubviews(_ notification: Notification) {
        super.splitViewDidResizeSubviews(notification)
        guard placed, !narrow, let list = splitView.arrangedSubviews.first else { return }
        defaults.set(Double(list.frame.width), forKey: CallsSplit.widthKey)
    }
}

public enum CallsSplit {
    public static let listWidth: CGFloat = 340
    public static let listRange: ClosedRange<CGFloat> = 280...420
    public static let widthKey = "CallsSplit.listWidth"
    /// The window width below which the call beside the list hides.
    public static let narrowBelow: CGFloat = 700
}

@MainActor
private func hosting(_ view: NSView) -> NSViewController {
    let controller = NSViewController()
    controller.view = view
    return controller
}

/// Split sections keep independent titlebar surfaces and the system's scrolling pocket.
@MainActor
public func installCallsToolbar(_ toolbar: NSToolbar, in window: NSWindow) {
    window.styleMask.insert(.fullSizeContentView)
    window.titlebarAppearsTransparent = true
    window.titlebarSeparatorStyle = .automatic
    window.titleVisibility = .hidden
    window.toolbarStyle = .unified
    window.toolbar = toolbar
}

/// The detail's notes, rendered from Markdown in the view's style.
public func renderNotes(_ source: String, _ style: NotesStyle) -> NSAttributedString {
    NotesMarkdown.render(source, style: .init(body: style.body, headings: style.headings, code: style.code, text: style.text,
                                              secondary: style.secondary, tertiary: style.tertiary, codeBackground: style.codeBackground, rule: style.rule,
                                              layout: .init(lineHeight: style.lineHeight, paragraphSpacing: style.paragraphSpacing,
                                                            headingSpacing: style.headingSpacing, labelLevels: style.labelLevels,
                                                            labelKern: style.labelKern)))
}
