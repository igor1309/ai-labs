import GlassLedger
import SwiftUI

/// The Settings window's look: the design system's tokens for each appearance,
/// and the window's own sizes that the design draws without a token.
public struct SettingsConfig: Sendable {

    public var light: GlassLedger
    public var dark: GlassLedger
    /// Line height as a ratio of the font size.
    public var lineHeight: CGFloat
    public var labelWidth: CGFloat
    public var windowWidth: CGFloat

    public init(
        light: GlassLedger,
        dark: GlassLedger,
        lineHeight: CGFloat,
        labelWidth: CGFloat,
        windowWidth: CGFloat
    ) {
        self.light = light
        self.dark = dark
        self.lineHeight = lineHeight
        self.labelWidth = labelWidth
        self.windowWidth = windowWidth
    }

    func tokens(for scheme: ColorScheme) -> GlassLedger {

        scheme == .dark ? dark : light
    }
}

public extension SettingsConfig {

    /// The window as Glass Ledger draws it.
    static let glassLedger: Self = {

        GlassLedger.registerFonts()

        return .init(
            light: .light,
            dark: .dark,
            lineHeight: 1.45,
            labelWidth: 172,
            windowWidth: 620
        )
    }()
}
