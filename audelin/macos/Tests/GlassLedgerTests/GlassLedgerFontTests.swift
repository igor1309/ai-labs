import AppKit
import Testing
@testable import GlassLedger

struct GlassLedgerFontTests {

    @Test func registeringMakesTheDesignFamiliesAvailable() {

        GlassLedger.registerFonts()
        GlassLedger.registerFonts()

        for tokens in [GlassLedger.light, .dark] {
            for family in [tokens.fontData, tokens.fontUi] {
                #expect(NSFont(name: family, size: 13)?.familyName == family)
                #expect(NSFontManager.shared.availableMembers(ofFontFamily: family)?.isEmpty == false, "\(family)")
            }
        }
        #expect(NSFont(name: "IBMPlexMono-Regular", size: 13) != nil)
        #expect(NSFont(name: "IBMPlexMono-SemiBold", size: 13) != nil)
        #expect(NSFont(name: "IBMPlexSans-Regular", size: 13) != nil)
    }

    @Test func eachMainBundleResolvesItsOwnResourceBundle() throws {

        let temporary = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        try FileManager.default.createDirectory(at: temporary, withIntermediateDirectories: true)
        defer { try? FileManager.default.removeItem(at: temporary) }

        for (mainPath, resourcesPath) in [
            ("Audelin.app", "Audelin.app/Contents/Resources"),
            ("swiftpm", "swiftpm"),
        ] {
            let mainURL = temporary.appendingPathComponent(mainPath)
            let bundleURL = temporary.appendingPathComponent(resourcesPath)
                .appendingPathComponent("Audelin_GlassLedger.bundle")
            let fontsURL = bundleURL.appendingPathComponent("Fonts")
            try FileManager.default.createDirectory(at: fontsURL, withIntermediateDirectories: true)
            if mainURL.pathExtension == "app" {
                let plist = try PropertyListSerialization.data(
                    fromPropertyList: ["CFBundleIdentifier": "test.audelin", "CFBundlePackageType": "APPL"],
                    format: .xml, options: 0
                )
                try plist.write(to: mainURL.appendingPathComponent("Contents/Info.plist"))
            }
            let fontURL = fontsURL.appendingPathComponent("fixture.ttf")
            try Data("font fixture".utf8).write(to: fontURL)

            var usedFallback = false
            let bundle = glassLedgerBundle(mainBundleURL: mainURL) {
                usedFallback = true
                return .main
            }
            #expect(!usedFallback, "\(mainPath) must resolve its own resource bundle")
            #expect(bundle.bundleURL.standardizedFileURL == bundleURL.standardizedFileURL)
            #expect(bundle.url(forResource: "fixture", withExtension: "ttf", subdirectory: "Fonts") == fontURL)
        }
    }
}
