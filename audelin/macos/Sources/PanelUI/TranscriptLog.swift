import AppKit
import GlassLedger
import SwiftUI

/// The log as one read-only text view, so a selection can span entries and
/// survive the text changing around it.
///
/// It is as tall as its text, up to the room it is given, and scrolls
/// beyond that, keeping the newest line in view while it follows live.
struct TranscriptLog: NSViewRepresentable {

    let lines: PanelState.Lines
    let tokens: GlassLedger
    let config: PanelConfig
    let event: (PanelEvent) -> Void

    func makeCoordinator() -> Coordinator { Coordinator(self) }

    func makeNSView(context: Context) -> NSScrollView {

        let scroll = NSScrollView()
        scroll.drawsBackground = false
        scroll.hasVerticalScroller = true
        scroll.autohidesScrollers = true

        let text = LogTextView(usingTextLayoutManager: true)
        text.isVerticallyResizable = true
        text.isHorizontallyResizable = false
        text.autoresizingMask = [.width]
        text.maxSize = NSSize(width: CGFloat.greatestFiniteMagnitude, height: .greatestFiniteMagnitude)
        text.textContainer?.widthTracksTextView = true
        text.textContainer?.lineFragmentPadding = 0
        text.textContainerInset = .zero
        text.isEditable = false
        text.isSelectable = true
        text.drawsBackground = false
        scroll.documentView = text

        let coordinator = context.coordinator
        text.selectionStarted = { [weak coordinator] in coordinator?.isSelecting = true }
        text.selectionEnded = { [weak coordinator, weak text] in
            guard let coordinator, let text else { return }
            coordinator.finishSelecting(text)
        }

        scroll.contentView.postsBoundsChangedNotifications = true
        NotificationCenter.default.addObserver(
            coordinator,
            selector: #selector(Coordinator.boundsChanged(_:)),
            name: NSView.boundsDidChangeNotification,
            object: scroll.contentView
        )
        coordinator.scroll = scroll

        return scroll
    }

    func updateNSView(_ scroll: NSScrollView, context: Context) {
        let diagStart = ContinuousClock.now
        defer { Self.diag("update", diagStart, lines.rows.count) }

        let coordinator = context.coordinator
        coordinator.parent = self

        let text = scroll.documentView as! LogTextView
        text.selectedTextAttributes = [
            .backgroundColor: NSColor(tokens.selBg),
            .foregroundColor: NSColor(tokens.selText),
        ]

        text.ruleColor = NSColor(tokens.rule)

        let storage = text.textStorage!
        // Only this path edits the storage; anything else, and the rows start over.
        if storage.length != coordinator.rows.length { coordinator.rows = Transcript.Rows() }
        let edit = coordinator.rows.update(lines, style: .init(tokens: tokens, config: config))
        coordinator.entries = edit.entries

        coordinator.quietly {
            // AppKit moves the selection to the end on any storage edit, even
            // one below it; the edit keeps the text above in place, so put it
            // back.
            let selection = text.selectedRange()
            Self.apply(edit, to: storage)
            let length = storage.length
            text.setSelectedRange(NSIntersectionRange(selection, NSRange(location: 0, length: length)))

            if lines.followsLive, !coordinator.isSelecting { text.scrollToEndOfDocument(nil) }
        }
    }

    func sizeThatFits(_ proposal: ProposedViewSize, nsView scroll: NSScrollView, context: Context) -> CGSize? {
        let diagStart = ContinuousClock.now
        defer { Self.diag("fits w=\(proposal.width.map { "\($0)" } ?? "nil") h=\(proposal.height.map { "\($0)" } ?? "nil")", diagStart, lines.rows.count) }

        let width = proposal.width ?? config.panelWidth
        guard let text = scroll.documentView as? NSTextView,
              let layout = text.textLayoutManager
        else { return nil }

        text.frame.size.width = width

        // Text that reaches the room it is given fills it: laying out what
        // fits shows that without laying out a long call's whole log.
        if let limit = proposal.height {
            layout.ensureLayout(for: CGRect(x: 0, y: 0, width: width, height: limit))
            if let below = layout.textLayoutFragment(for: CGPoint(x: 0, y: limit)),
               below.layoutFragmentFrame.maxY > limit {
                return CGSize(width: width, height: limit)
            }
        }
        // Lay out only the document's end, whose bottom edge is the height;
        // laying out a long call's whole log on every update grows with it.
        let end = NSTextRange(location: layout.documentRange.endLocation)
        layout.ensureLayout(for: end)
        var bottom = layout.usageBoundsForTextContainer.maxY
        layout.enumerateTextSegments(in: end, type: .standard, options: .middleFragmentsExcluded) { _, rect, _, _ in
            bottom = max(bottom, rect.maxY)
            return true
        }
        let height = ceil(bottom)

        return CGSize(width: width, height: min(height, proposal.height ?? height))
    }

    // DIAGNOSTIC (LAB-817), reverted before landing.
    static func diag(_ what: String, _ start: ContinuousClock.Instant, _ rows: Int) {
        let d = ContinuousClock.now - start
        let ms = Double(d.components.seconds) * 1000 + Double(d.components.attoseconds) / 1e15
        FileHandle.standardError.write(Data("LOGDIAG \(rows) \(what) \(String(format: "%.2f", ms))\n".utf8))
    }

    static func dismantleNSView(_ scroll: NSScrollView, coordinator: Coordinator) {

        NotificationCenter.default.removeObserver(coordinator)
    }
}

// MARK: - Updating in place

extension TranscriptLog {

    /// Replaces the rows from the first that changed: characters above
    /// keep their position and layout, so the reader's selection and scroll
    /// position stay.
    static func apply(_ edit: Transcript.Edit, to storage: NSTextStorage) {

        storage.replaceCharacters(in: edit.range, with: edit.text)
    }
}

// MARK: - Coordinator

extension TranscriptLog {

    @MainActor
    final class Coordinator: NSObject {

        var parent: TranscriptLog
        var entries: [Transcript.EntryRange] = []
        var rows = Transcript.Rows()
        weak var scroll: NSScrollView?
        /// A drag is selecting text: the log holds still under it.
        var isSelecting = false
        private var isQuiet = false
        private var atBottom = true
        private var size = NSSize.zero

        init(_ parent: TranscriptLog) { self.parent = parent }

        /// A drag ended: what it selected is held, and the selection fades
        /// from the log, which draws held text like any other. A click that
        /// only clears the selection lets nothing go.
        func finishSelecting(_ text: LogTextView) {

            isSelecting = false

            let range = text.selectedRange()
            guard let storage = text.textStorage,
                  let held = Transcript.held(in: range, of: storage, entries: entries)
            else { return }

            text.fadeSelection(range)
            text.setSelectedRange(NSRange(location: range.location, length: 0))
            parent.event(.hold(held))
        }

        /// Moves the log without reporting a scroll: only the reader scrolls.
        func quietly(_ change: () -> Void) {

            isQuiet = true
            change()
            isQuiet = false
            size = scroll?.contentView.bounds.size ?? .zero
            atBottom = isAtBottom
        }

        @objc func boundsChanged(_ notification: Notification) {

            guard !isQuiet, let scroll else { return }

            // The log was resized, not scrolled.
            if scroll.contentView.bounds.size != size {
                quietly {
                    if parent.lines.followsLive { scroll.documentView?.scrollToEndOfDocument(nil) }
                }
                return
            }

            let now = isAtBottom
            guard now != atBottom else { return }

            atBottom = now
            parent.event(.scrolled(atBottom: now))
        }

        private var isAtBottom: Bool {

            guard let scroll, let document = scroll.documentView else { return true }
            return scroll.contentView.documentVisibleRect.maxY >= document.bounds.height - 4
        }
    }
}

// MARK: - Text view

/// Reports a mouse selection once it is made: `mouseDown` runs AppKit's own
/// tracking loop and returns only after the button is released, so neither
/// the delegate nor an app event monitor sees the end of the drag.
final class LogTextView: NSTextView {

    var selectionStarted: (() -> Void)?
    var selectionEnded: (() -> Void)?

    /// How long a held selection takes to fade (owner, 2026-10-22).
    static let fade: TimeInterval = 0.3

    override func mouseDown(with event: NSEvent) {

        selectionStarted?()
        super.mouseDown(with: event)
        selectionEnded?()
    }

    var ruleColor = NSColor.clear

    override func drawBackground(in rect: NSRect) {

        super.drawBackground(in: rect)
        ruleColor.setFill()
        ruleFrames(in: rect).filter { $0.intersects(rect) }.forEach { $0.fill(using: .sourceOver) }
    }

    /// How far above or below a drawn rect a rule's paragraph can end.
    private static let ruleReach: CGFloat = 64

    /// Where the lines under late groups go, in this view; with a rect, only
    /// those near it. Laying out and scanning a long call's whole log on
    /// every redraw grows with the call.
    func ruleFrames(in rect: NSRect? = nil) -> [NSRect] {

        guard let storage = textStorage,
              let layout = textLayoutManager,
              let content = layout.textContentManager
        else { return [] }

        let origin = textContainerOrigin
        let document = content.documentRange
        var scan = NSRange(location: 0, length: storage.length)
        if let rect {
            let area = CGRect(
                x: 0, y: max(0, rect.minY - origin.y - Self.ruleReach),
                width: bounds.width, height: rect.height + 2 * Self.ruleReach
            )
            layout.ensureLayout(for: area)
            // No text where the area starts: none below it either.
            guard let start = layout.textLayoutFragment(for: CGPoint(x: 0, y: area.minY))?.rangeInElement.location
            else { return [] }
            let end = layout.textLayoutFragment(for: CGPoint(x: 0, y: area.maxY))?.rangeInElement.endLocation ?? document.endLocation
            let from = content.offset(from: document.location, to: start)
            let to = min(storage.length, content.offset(from: document.location, to: end))
            scan = NSRange(location: from, length: max(0, to - from))
        } else {
            layout.ensureLayout(for: document)
        }

        var frames: [NSRect] = []
        storage.enumerateAttribute(Transcript.ruleBelow, in: scan) { value, range, _ in
            guard let gap = value as? CGFloat,
                  let end = content.location(document.location, offsetBy: NSMaxRange(range) - 1),
                  let fragment = layout.textLayoutFragment(for: end),
                  let line = fragment.textLineFragments.last
            else { return }

            let y = origin.y + fragment.layoutFragmentFrame.minY + line.typographicBounds.maxY + gap
            frames.append(NSRect(x: 0, y: y, width: bounds.width, height: Transcript.ruleWidth))
        }
        return frames
    }

    /// Lays a picture of the selected lines over them and fades it out, so
    /// the selection dissolves into the text below once that is unselected.
    func fadeSelection(_ range: NSRange) {

        guard let layout = textLayoutManager,
              let content = layout.textContentManager,
              let start = content.location(content.documentRange.location, offsetBy: range.location),
              let end = content.location(start, offsetBy: range.length),
              let textRange = NSTextRange(location: start, end: end)
        else { return }

        var bounds = NSRect.null
        layout.enumerateTextSegments(in: textRange, type: .selection, options: []) { _, frame, _, _ in
            bounds = bounds.union(frame)
            return true
        }
        let origin = textContainerOrigin
        let rect = bounds.offsetBy(dx: origin.x, dy: origin.y).integral
        guard !rect.isEmpty, let picture = bitmapImageRepForCachingDisplay(in: rect) else { return }
        cacheDisplay(in: rect, to: picture)

        let image = NSImage(size: rect.size)
        image.addRepresentation(picture)
        let overlay = NSImageView(frame: rect)
        overlay.image = image
        overlay.imageScaling = .scaleNone
        addSubview(overlay)

        NSAnimationContext.runAnimationGroup { context in
            context.duration = Self.fade
            overlay.animator().alphaValue = 0
        }
        // Removed on a timer: an animation's completion never comes in a
        // window that is not on screen.
        DispatchQueue.main.asyncAfter(deadline: .now() + Self.fade) {
            overlay.removeFromSuperview()
        }
    }
}
