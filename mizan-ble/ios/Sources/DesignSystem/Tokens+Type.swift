import CoreText
import Foundation
import SwiftUI

/// A token's value, as the design file types it.
enum Token {

    case color(Color)
    case number(CGFloat)
    case string(String)
}

public extension Tokens {

    /// The weights the design uses, on the fonts' `wght` axis.
    enum Weight: CGFloat, Sendable {

        case regular = 400
        case medium = 500
        case semibold = 600
        case bold = 700
    }

    /// Numbers and titles: amounts, the countdown, the wordmark.
    static func display(_ size: CGFloat, _ weight: Weight = .semibold) -> Font {

        font(fontDisplay, size, weight)
    }

    /// Text: labels, buttons, body copy.
    static func text(_ size: CGFloat, _ weight: Weight = .regular) -> Font {

        font(fontText, size, weight)
    }

    /// Codes and machine state: eyebrows, device codes, status.
    static func mono(_ size: CGFloat, _ weight: Weight = .medium) -> Font {

        font(fontMono, size, weight)
    }

    /// Makes the bundled fonts available to this process. Safe to call more
    /// than once; every font helper calls it.
    static func registerFonts() {

        _ = fontsRegistered
    }
}

extension Tokens {

    /// The bundled font of `family` at `size`, set to `weight` on its
    /// variable `wght` axis.
    static func ctFont(_ family: String, _ size: CGFloat, _ weight: Weight) -> CTFont {

        registerFonts()
        let attributes: [CFString: Any] = [
            kCTFontFamilyNameAttribute: family,
            kCTFontVariationAttribute: [wghtAxis: weight.rawValue],
        ]
        return CTFontCreateWithFontDescriptor(
            CTFontDescriptorCreateWithAttributes(attributes as CFDictionary),
            size,
            nil
        )
    }
}

/// The `wght` variation axis tag.
let wghtAxis: UInt32 = 0x7767_6874

private extension Tokens {

    static func font(_ family: String, _ size: CGFloat, _ weight: Weight) -> Font {

        Font(ctFont(family, size, weight))
    }
}

private let fontsRegistered: Void = {

    let urls = Bundle.module.urls(forResourcesWithExtension: "ttf", subdirectory: "Fonts") ?? []
    CTFontManagerRegisterFontURLs(urls as CFArray, .process, true, nil)
}()

extension Color {

    static func hex(_ rgb: UInt32, _ alpha: UInt32) -> Color {

        .init(
            .sRGB,
            red: Double((rgb >> 16) & 0xFF) / 255,
            green: Double((rgb >> 8) & 0xFF) / 255,
            blue: Double(rgb & 0xFF) / 255,
            opacity: Double(alpha) / 255
        )
    }
}
