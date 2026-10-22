import AppKit
import SwiftUI

public extension GlassLedger {

    /// The transcript font: times, paths, sizes.
    func data(_ size: CGFloat, _ weight: Font.Weight = .regular) -> Font {

        .custom(fontData, fixedSize: size).weight(weight)
    }

    /// The interface font: labels, titles, buttons.
    func ui(_ size: CGFloat, _ weight: Font.Weight = .regular) -> Font {

        .custom(fontUi, fixedSize: size).weight(weight)
    }

    /// Extra space that makes each line of the font as tall as the design's
    /// line height, a ratio of the font size.
    func leading(_ family: String, _ size: CGFloat, _ lineHeight: CGFloat) -> CGFloat {

        let natural = NSFont(name: family, size: size)
            .map { $0.ascender - $0.descender + $0.leading } ?? size

        return max(0, size * lineHeight - natural)
    }
}

public extension View {

    /// Spreads the extra space as the design does: between lines, and half of
    /// it above the first line and below the last.
    func lineHeight(_ leading: CGFloat) -> some View {

        lineSpacing(leading).padding(.vertical, leading / 2)
    }
}
