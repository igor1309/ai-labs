import CoreText
import Foundation
import SwiftUI

/// The live panel's look: colours for each appearance, fonts and metrics.
public struct PanelConfig: Sendable {

    public var light: Palette
    public var dark: Palette
    public var fonts: Fonts
    public var metrics: Metrics

    public init(light: Palette, dark: Palette, fonts: Fonts, metrics: Metrics) {

        self.light = light
        self.dark = dark
        self.fonts = fonts
        self.metrics = metrics
    }

    func palette(for scheme: ColorScheme) -> Palette {

        scheme == .dark ? dark : light
    }
}

public extension PanelConfig {

    struct Palette: Sendable {

        public var glass: Color
        public var back: Color
        public var text: Color
        public var sub: Color
        public var gutter: Color
        public var them: Color
        public var me: Color
        public var selBg: Color
        public var selText: Color
        public var card: Color
        public var rule: Color
        public var rec: Color
        public var errBg: Color
        public var shadow: Color
    }

    struct Fonts: Sendable {

        /// Transcript, times, status.
        public var data: String
        /// Labels and buttons.
        public var ui: String
        public var caption: CGFloat
        public var small: CGFloat
        public var body: CGFloat
        public var lineHeight: CGFloat
        public var looseLineHeight: CGFloat
    }

    struct Metrics: Sendable {

        public var space2: CGFloat
        public var space4: CGFloat
        public var space6: CGFloat
        public var space8: CGFloat
        public var space12: CGFloat
        public var space16: CGFloat
        public var radiusBar: CGFloat
        public var radiusControl: CGFloat
        public var radiusCard: CGFloat
        public var radiusPanel: CGFloat
        public var gutterWidth: CGFloat
        public var panelWidth: CGFloat
    }
}

// MARK: - Glass Ledger

public extension PanelConfig {

    /// The Glass Ledger design system's tokens.
    static let glassLedger: Self = {

        registerFonts()

        return .init(
            light: .init(
                glass: .hex(0xFFFFFF, 0xE6), back: .hex(0xE3E5E8),
                text: .hex(0x16181D), sub: .hex(0x5A606A), gutter: .hex(0x8A909A),
                them: .hex(0xC27A06), me: .hex(0x0E9F92),
                selBg: .hex(0x0E9F92), selText: .hex(0xFFFFFF),
                card: .hex(0xF1F3F6), rule: .hex(0x000000, 0x1A),
                rec: .hex(0xE5484D), errBg: .hex(0xE5484D, 0x14),
                shadow: .hex(0x000000, 0x40)
            ),
            dark: .init(
                glass: .hex(0x15171C, 0xEB), back: .hex(0x1F2228),
                text: .hex(0xE8EAED), sub: .hex(0xA3A9B3), gutter: .hex(0x7C828D),
                them: .hex(0xF5B454), me: .hex(0x4FD1C5),
                selBg: .hex(0x4FD1C5), selText: .hex(0x0B1F1D),
                card: .hex(0x262A33), rule: .hex(0xFFFFFF, 0x14),
                rec: .hex(0xF2555A), errBg: .hex(0xF2555A, 0x1F),
                shadow: .hex(0x000000, 0x80)
            ),
            fonts: .init(
                data: "IBM Plex Mono", ui: "IBM Plex Sans",
                caption: 11, small: 12, body: 13,
                lineHeight: 1.45, looseLineHeight: 1.55
            ),
            metrics: .init(
                space2: 2, space4: 4, space6: 6, space8: 8, space12: 12, space16: 16,
                radiusBar: 2, radiusControl: 6, radiusCard: 10, radiusPanel: 16,
                gutterWidth: 80, panelWidth: 396
            )
        )
    }()
}

private func registerFonts() {

    let urls = Bundle.module.urls(forResourcesWithExtension: "ttf", subdirectory: "Fonts") ?? []
    CTFontManagerRegisterFontURLs(urls as CFArray, .process, true, nil)
}

private extension Color {

    static func hex(_ rgb: UInt32, _ alpha: UInt32 = 0xFF) -> Color {

        .init(
            .sRGB,
            red: Double((rgb >> 16) & 0xFF) / 255,
            green: Double((rgb >> 8) & 0xFF) / 255,
            blue: Double(rgb & 0xFF) / 255,
            opacity: Double(alpha) / 255
        )
    }
}
