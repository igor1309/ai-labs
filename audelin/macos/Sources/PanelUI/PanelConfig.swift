import GlassLedger
import SwiftUI

/// The live panel's look: the design system's tokens for each appearance, and
/// the panel's own sizes that the design draws without a token.
public struct PanelConfig: Sendable {

    public var light: GlassLedger
    public var dark: GlassLedger
    /// Line height as a ratio of the font size.
    public var lineHeight: CGFloat
    /// Line height of the empty-log hint and the new-lines pill.
    public var looseLineHeight: CGFloat
    public var gutterWidth: CGFloat
    public var panelWidth: CGFloat

    public init(
        light: GlassLedger,
        dark: GlassLedger,
        lineHeight: CGFloat,
        looseLineHeight: CGFloat,
        gutterWidth: CGFloat,
        panelWidth: CGFloat
    ) {
        self.light = light
        self.dark = dark
        self.lineHeight = lineHeight
        self.looseLineHeight = looseLineHeight
        self.gutterWidth = gutterWidth
        self.panelWidth = panelWidth
    }

    func tokens(for scheme: ColorScheme) -> GlassLedger {

        scheme == .dark ? dark : light
    }
}

public extension PanelConfig {

    /// The panel as Glass Ledger draws it.
    static let glassLedger: Self = {

        GlassLedger.registerFonts()

        return .init(
            light: .light,
            dark: .dark,
            lineHeight: 1.45,
            looseLineHeight: 1.55,
            gutterWidth: 80,
            panelWidth: 396
        )
    }()
}
