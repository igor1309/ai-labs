import AppKit
import GlassLedger
import SwiftUI

/// Draws the held selection as one accessible, truncating line.
struct HeldTextLabel: NSViewRepresentable {

    let text: String
    let tokens: GlassLedger

    func makeNSView(context: Context) -> NSTextField {

        let label = NSTextField(labelWithString: text)
        label.maximumNumberOfLines = 1
        label.lineBreakMode = .byTruncatingMiddle
        label.setContentCompressionResistancePriority(.defaultLow, for: .horizontal)
        label.setAccessibilityIdentifier("held-text")
        return label
    }

    func updateNSView(_ label: NSTextField, context: Context) {

        label.stringValue = text
        label.setAccessibilityLabel(text)
        let descriptor = NSFontDescriptor(fontAttributes: [.family: tokens.fontData])
        label.font = NSFont(descriptor: descriptor, size: tokens.typeSmall)
            ?? .monospacedSystemFont(ofSize: tokens.typeSmall, weight: .regular)
        label.textColor = NSColor(tokens.text)
    }

    func sizeThatFits(_ proposal: ProposedViewSize, nsView: NSTextField, context: Context) -> CGSize? {

        CGSize(width: proposal.width ?? nsView.intrinsicContentSize.width, height: nsView.intrinsicContentSize.height)
    }
}
