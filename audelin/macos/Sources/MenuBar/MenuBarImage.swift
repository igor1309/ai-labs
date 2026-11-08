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
    func image() -> NSImage {
        let image = NSImage(systemSymbolName: symbol, accessibilityDescription: title)?
            .withSymbolConfiguration(.init(paletteColors: [isRed ? .systemRed : .labelColor])) ?? NSImage()
        image.isTemplate = !isRed
        return image
    }
}
