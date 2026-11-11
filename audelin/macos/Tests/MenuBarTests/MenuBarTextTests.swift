import Foundation
@testable import MenuBar
import Testing

struct MenuBarTextTests {

    @Test func looksUpTheLanguageItIsGiven() {

        #expect(MenuBarText(language: .russian)("action.quit") == "Выйти")
        #expect(MenuBarText(language: .english)("action.quit") == "Quit")
    }

    @Test func everyKeyHasRussianAndEnglishText() {

        let russian = MenuBarText(language: .russian), english = MenuBarText(language: .english)
        for key in MenuBarPhrase.allCases.map(\.rawValue) {
            #expect(russian(key) != key, "\(key) has no Russian text")
            #expect(english(key) != key, "\(key) has no English text")
            #expect(english(key) != russian(key), "\(key) is not translated")
        }
    }

    @Test func aMissingKeyFallsBackToTheKey() {

        #expect(MenuBarText(language: .english)("no.such.key") == "no.such.key")
    }

    @Test func anAppFindsTheTextInItsResources() throws {

        let temporary = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: temporary) }
        let app = temporary.appendingPathComponent("Audelin.app")
        let resources = app.appendingPathComponent("Contents/Resources/Audelin_MenuBar.bundle/en.lproj")
        try FileManager.default.createDirectory(at: resources, withIntermediateDirectories: true)
        let plist = try PropertyListSerialization.data(
            fromPropertyList: ["CFBundleIdentifier": "test.audelin", "CFBundlePackageType": "APPL"],
            format: .xml, options: 0
        )
        try plist.write(to: app.appendingPathComponent("Contents/Info.plist"))

        var usedFallback = false
        let bundle = menuBarBundle(mainBundleURL: app) {
            usedFallback = true
            return .main
        }
        #expect(!usedFallback)
        #expect(bundle.path(forResource: "en", ofType: "lproj") != nil)
    }
}
