import AppKit
import GlassLedger
import SwiftUI

/// Draws the row menu's supplied items without starting AppKit's modal menu tracking.
public struct CallsListMenuPreview: NSViewRepresentable {
    private let state: CallsListState
    private let rowID: String
    private let text: CallsListText
    @Environment(\.colorScheme) private var scheme

    public init(state: CallsListState, rowID: String, text: CallsListText) {
        self.state = state; self.rowID = rowID; self.text = text
    }

    public func makeNSView(context: Context) -> NSView { MenuCells() }

    public func updateNSView(_ view: NSView, context: Context) {
        guard let view = view as? MenuCells, let row = state.rows.first(where: { $0.id == rowID }) else { return }
        view.menu = makeRowMenu(CallsListView(state: state, text: text, event: { _ in }).menu(row))
        view.tokens = .for(scheme)
        view.needsDisplay = true
    }
}

private final class MenuCells: NSView {
    var tokens = GlassLedger.for(.light)
    override var isFlipped: Bool { true }

    override func draw(_ dirtyRect: NSRect) {
        NSColor(tokens.surface).setFill()
        bounds.fill()
        var y = tokens.space8
        for item in menu?.items ?? [] {
            if item.isSeparatorItem {
                NSColor(tokens.rule).setFill()
                NSRect(x: tokens.space8, y: y + tokens.space4, width: bounds.width - tokens.space16, height: tokens.space2 / 2).fill()
                y += tokens.space8
            } else {
                (item.title as NSString).draw(in: NSRect(x: tokens.space16, y: y, width: bounds.width - tokens.space32, height: tokens.space24),
                                             withAttributes: [.font: tokens.nsUi(tokens.typeSmall),
                                                              .foregroundColor: NSColor(item.isEnabled ? tokens.text : tokens.disText)])
                y += tokens.space24
            }
        }
    }
}
