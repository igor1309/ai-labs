import AppKit

public extension MenuBarItem {
    @MainActor
    static func updateDot(colour: NSColor) -> NSImage {
        NSImage(size: NSSize(width: 8, height: 8), flipped: false) { bounds in
            colour.setFill()
            NSBezierPath(ovalIn: bounds).fill()
            return true
        }
    }

    @MainActor
    func image(updateBadge: Bool, accent: NSColor) -> NSImage {
        let base = NSImage(systemSymbolName: symbol, accessibilityDescription: title)?
            .withSymbolConfiguration(.init(paletteColors: [isRed ? .systemRed : .labelColor])) ?? NSImage()
        guard updateBadge else {
            base.isTemplate = !isRed
            return base
        }
        base.isTemplate = false
        // MenuBarExtra extracts an NSImage from its label. Composite inside its
        // existing bounds so adding the badge cannot change the status item's width.
        let result = NSImage(size: base.size, flipped: false) { bounds in
            base.draw(in: bounds)
            let dot = NSRect(x: bounds.maxX - 11, y: bounds.maxY - 11, width: 11, height: 11)
            // A cleared ring exposes the actual menu bar, including its material.
            NSGraphicsContext.saveGraphicsState()
            NSGraphicsContext.current?.compositingOperation = .clear
            NSBezierPath(ovalIn: dot).fill()
            NSGraphicsContext.restoreGraphicsState()
            accent.setFill()
            NSBezierPath(ovalIn: dot.insetBy(dx: 1.5, dy: 1.5)).fill()
            return true
        }
        result.alignmentRect = base.alignmentRect
        result.isTemplate = false
        return result
    }
}
