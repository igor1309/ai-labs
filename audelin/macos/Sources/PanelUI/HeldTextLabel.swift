import AppKit
import GlassLedger
import SwiftUI

/// Draws a held selection in up to three lines, with the full text accessible.
struct HeldTextLabel: NSViewRepresentable {

    let text: String
    let tokens: GlassLedger

    func makeNSView(context: Context) -> NSTextField {

        let label = NSTextField(labelWithString: text)
        label.maximumNumberOfLines = 3
        label.cell?.wraps = true
        label.cell?.usesSingleLineMode = false
        label.lineBreakMode = .byWordWrapping
        label.cell?.truncatesLastVisibleLine = true
        label.setContentCompressionResistancePriority(.defaultLow, for: .horizontal)
        label.setAccessibilityIdentifier("held-text")
        return label
    }

    func updateNSView(_ label: NSTextField, context: Context) {

        label.stringValue = text
        label.setAccessibilityLabel(text)
        label.toolTip = text
        label.font = tokens.nsData(tokens.typeSmall)
        label.textColor = NSColor(tokens.text)
    }

    func sizeThatFits(_ proposal: ProposedViewSize, nsView: NSTextField, context: Context) -> CGSize? {

        let width = max(1, proposal.width ?? nsView.intrinsicContentSize.width)
        let size = nsView.cell?.cellSize(forBounds: NSRect(x: 0, y: 0, width: width, height: .greatestFiniteMagnitude))
            ?? nsView.intrinsicContentSize
        return CGSize(width: width, height: ceil(size.height))
    }
}
