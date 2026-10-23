import CoreText
import Foundation
import SwiftUI

public extension GlassLedger {

    static func `for`(_ scheme: ColorScheme) -> GlassLedger {

        scheme == .dark ? dark : light
    }

    /// Makes the bundled IBM Plex fonts available to this process. Safe to
    /// call more than once.
    static func registerFonts() {

        _ = fontsRegistered
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
