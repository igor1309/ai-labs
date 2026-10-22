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

        let coordinator = context.coordinator
        coordinator.parent = self

        let text = scroll.documentView as! LogTextView
        text.selectedTextAttributes = [
            .backgroundColor: NSColor(tokens.selBg),
            .foregroundColor: NSColor(tokens.selText),
        ]

        let transcript = Transcript(lines: lines, style: .init(tokens: tokens, config: config))
        coordinator.entries = transcript.entries

        coordinator.quietly {
            // AppKit moves the selection to the end on any storage edit, even
            // one below it; the edit keeps the text above in place, so put it
            // back.
            let selection = text.selectedRange()
            apply(transcript.string, to: text.textStorage!)
            let length = text.textStorage!.length
            text.setSelectedRange(NSIntersectionRange(selection, NSRange(location: 0, length: length)))

            if lines.followsLive, !coordinator.isSelecting { text.scrollToEndOfDocument(nil) }
        }
    }

    func sizeThatFits(_ proposal: ProposedViewSize, nsView scroll: NSScrollView, context: Context) -> CGSize? {

        let width = proposal.width ?? config.panelWidth
        guard let text = scroll.documentView as? NSTextView,
              let layout = text.textLayoutManager
        else { return nil }

        text.frame.size.width = width
        layout.ensureLayout(for: layout.documentRange)
        let height = ceil(layout.usageBoundsForTextContainer.height)

        return CGSize(width: width, height: min(height, proposal.height ?? height))
    }

    static func dismantleNSView(_ scroll: NSScrollView, coordinator: Coordinator) {

        NotificationCenter.default.removeObserver(coordinator)
    }
}

// MARK: - Updating in place

private extension TranscriptLog {

    /// Replaces only what changed after the common prefix, and restyles the
    /// prefix in place: characters above the change keep their position, so
    /// the reader's selection and scroll position stay.
    func apply(_ new: NSAttributedString, to storage: NSTextStorage) {

        let old = storage.string as NSString
        let next = new.string as NSString
        var prefix = 0
        let limit = min(old.length, next.length)
        while prefix < limit, old.character(at: prefix) == next.character(at: prefix) { prefix += 1 }

        storage.beginEditing()
        storage.replaceCharacters(
            in: NSRange(location: prefix, length: old.length - prefix),
            with: new.attributedSubstring(from: NSRange(location: prefix, length: next.length - prefix))
        )
        new.enumerateAttributes(in: NSRange(location: 0, length: prefix)) { attributes, range, _ in
            storage.setAttributes(attributes, range: range)
        }
        storage.endEditing()
    }
}

// MARK: - Coordinator

extension TranscriptLog {

    @MainActor
    final class Coordinator: NSObject {

        var parent: TranscriptLog
        var entries: [Transcript.EntryRange] = []
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
