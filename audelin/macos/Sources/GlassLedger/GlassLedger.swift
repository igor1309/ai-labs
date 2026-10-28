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

    let bundle = glassLedgerBundle(mainBundleURL: Bundle.main.bundleURL)
    let urls = bundle.urls(forResourcesWithExtension: "ttf", subdirectory: "Fonts") ?? []
    CTFontManagerRegisterFontURLs(urls as CFArray, .process, true, nil)
}()

func glassLedgerBundle(mainBundleURL: URL, fallback: () -> Bundle = { Bundle.module }) -> Bundle {

    // App bundles keep resources in Contents/Resources; SwiftPM executables
    // can also use the generated module lookup beside the executable or in the build.
    Bundle(url: mainBundleURL)?
        .url(forResource: "Audelin_GlassLedger", withExtension: "bundle")
        .flatMap(Bundle.init(url:)) ?? fallback()
}

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
