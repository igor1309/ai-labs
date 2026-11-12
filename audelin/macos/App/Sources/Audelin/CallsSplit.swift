import AppKit
import Composer
import SummaryPreviewUI
import SwiftUI

/// The calls window's two panes: the list at a width the divider sets, kept
/// across restarts, and the selected call's detail filling the rest. Tab moves
/// the keyboard from one pane to the other.
@MainActor
func makeCallsSplit(list: NSView, detail: NSView, defaults: UserDefaults = .standard) -> NSSplitViewController {
    let split = CallsSplitController(defaults: defaults)
    split.splitView.isVertical = true
    split.splitView.dividerStyle = .thin
    let listItem = NSSplitViewItem(viewController: hosting(list))
    listItem.minimumThickness = CallsSplit.listRange.lowerBound
    listItem.maximumThickness = CallsSplit.listRange.upperBound
    listItem.holdingPriority = .init(260)
    listItem.canCollapse = false
    let detailItem = NSSplitViewItem(viewController: hosting(detail))
    detailItem.minimumThickness = CallsSplit.listRange.lowerBound
    detailItem.canCollapse = false
    split.addSplitViewItem(listItem)
    split.addSplitViewItem(detailItem)
    list.nextKeyView = detail
    detail.nextKeyView = list
    return split
}

/// Puts the divider where it was left, or at the list's own width, once the
/// window first lays it out, and saves each move from then on.
final class CallsSplitController: NSSplitViewController {
    private let defaults: UserDefaults
    private var placed = false

    init(defaults: UserDefaults) {
        self.defaults = defaults
        super.init(nibName: nil, bundle: nil)
    }

    @available(*, unavailable) required init?(coder: NSCoder) { fatalError("init(coder:) is not used") }

    override func viewDidLayout() {
        super.viewDidLayout()
        guard !placed, splitView.bounds.width > 0 else { return }
        placed = true
        let saved = defaults.object(forKey: CallsSplit.widthKey) as? Double
        splitView.setPosition(saved.map { CGFloat($0) } ?? CallsSplit.listWidth, ofDividerAt: 0)
    }

    override func splitViewDidResizeSubviews(_ notification: Notification) {
        super.splitViewDidResizeSubviews(notification)
        guard placed, let list = splitView.arrangedSubviews.first else { return }
        defaults.set(Double(list.frame.width), forKey: CallsSplit.widthKey)
    }
}

enum CallsSplit {
    static let listWidth: CGFloat = 340
    static let listRange: ClosedRange<CGFloat> = 280...420
    static let widthKey = "CallsSplit.listWidth"
}

@MainActor
private func hosting(_ view: NSView) -> NSViewController {
    let controller = NSViewController()
    controller.view = view
    return controller
}

/// The detail as the summary view draws it; nil when no call is selected.
func detailState(_ detail: CallsDetail?) -> SummaryPreviewState? {
    guard let detail else { return nil }
    let notes: SummaryPreviewState.Notes, canRetry: Bool
    switch detail.content {
    case let .notes(source): notes = .markdown(source); canRetry = false
    case let .unreadable(reason): notes = .unreadable(reason); canRetry = false
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
    var body: some View {
        SummaryPreviewView(state: detailState(model.detail), text: text(),
                           event: detailSender { await model.send(detail: $0) }, render: renderNotes)
    }
}

/// The detail view's event handler: each button sent to the calls window as its action.
func detailSender(_ send: @escaping @MainActor (CallsDetailEvent) async -> Void) -> (SummaryPreviewEvent) -> Void {
    { event in Task { @MainActor in await send(detailEvent(event)) } }
}
