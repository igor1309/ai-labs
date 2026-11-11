import AppKit
import SwiftUI

/// AppKit owns a segmented control's focus, clicks, arrow keys and
/// accessibility while SwiftUI draws its segments: Tab reaches the control,
/// the arrow keys move to the next enabled segment, and each segment is a
/// radio button to assistive apps.
struct SettingsSegmentsTarget: NSViewRepresentable {
    var titles: [String]
    var enabled: [Bool]
    var selected: Int?
    var identifier: String
    var segmentIdentifiers: [String]
    var select: (Int) -> Void

    func makeNSView(context: Context) -> SegmentsView { SegmentsView() }

    func updateNSView(_ view: SegmentsView, context: Context) {
        view.update(titles: titles, enabled: enabled, selected: selected, identifier: identifier,
                    segmentIdentifiers: segmentIdentifiers, select: select)
    }
}

final class SegmentsView: NSView {
    private var enabled: [Bool] = []
    private var selected: Int?
    private var select: (Int) -> Void = { _ in }
    private var segments: [SegmentElement] = []

    func update(titles: [String], enabled: [Bool], selected: Int?, identifier: String,
                segmentIdentifiers: [String], select: @escaping (Int) -> Void) {
        self.enabled = enabled
        self.selected = selected
        self.select = select
        focusRingType = .exterior
        setAccessibilityElement(true)
        setAccessibilityRole(.radioGroup)
        setAccessibilityIdentifier(identifier)
        if segments.count != titles.count {
            segments = titles.indices.map { SegmentElement(index: $0, owner: self) }
        }
        for (index, segment) in segments.enumerated() {
            segment.setAccessibilityLabel(titles[index])
            segment.setAccessibilityIdentifier(segmentIdentifiers[index])
            segment.setAccessibilityEnabled(enabled[index])
            segment.setAccessibilityValue(NSNumber(value: index == selected))
        }
        setAccessibilityChildren(segments)
    }

    /// Picks a segment, unless it is disabled or already picked.
    func pick(_ index: Int) {
        guard enabled.indices.contains(index), enabled[index], index != selected else { return }
        select(index)
    }

    override var acceptsFirstResponder: Bool { enabled.contains(true) }
    override var canBecomeKeyView: Bool { enabled.contains(true) }
    override var focusRingMaskBounds: NSRect { bounds }
    override func drawFocusRingMask() { NSBezierPath(roundedRect: bounds, xRadius: 6, yRadius: 6).fill() }

    override func mouseDown(with event: NSEvent) {
        guard !segments.isEmpty, bounds.width > 0 else { return }
        let x = convert(event.locationInWindow, from: nil).x
        pick(min(segments.count - 1, max(0, Int(x / (bounds.width / CGFloat(segments.count))))))
    }

    override func keyDown(with event: NSEvent) {
        switch event.specialKey {
        case .leftArrow?: step(-1)
        case .rightArrow?: step(1)
        default: super.keyDown(with: event)
        }
    }

    /// The nearest enabled segment past the picked one in the direction.
    private func step(_ direction: Int) {
        var index = (selected ?? -direction) + direction
        while enabled.indices.contains(index) {
            if enabled[index] { pick(index); return }
            index += direction
        }
    }

    func segmentFrame(_ index: Int) -> NSRect {
        let width = bounds.width / CGFloat(max(segments.count, 1))
        let local = NSRect(x: CGFloat(index) * width, y: 0, width: width, height: bounds.height)
        guard let window else { return local }
        return window.convertToScreen(convert(local, to: nil))
    }
}

/// One segment to assistive apps: a radio button pressed to pick it.
private final class SegmentElement: NSAccessibilityElement {
    let index: Int
    weak var owner: SegmentsView?

    init(index: Int, owner: SegmentsView) {
        self.index = index
        self.owner = owner
        super.init()
        setAccessibilityRole(.radioButton)
        setAccessibilityParent(owner)
    }

    override func accessibilityFrame() -> NSRect { owner?.segmentFrame(index) ?? .zero }

    override func accessibilityPerformPress() -> Bool {
        guard let owner, isAccessibilityEnabled() else { return false }
        owner.pick(index)
        return true
    }
}
