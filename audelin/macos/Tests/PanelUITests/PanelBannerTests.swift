import AppKit
import SwiftUI
import RenderedText
import Testing
@testable import PanelUI

@MainActor
struct PanelBannerTests {

    @Test(arguments: [ColorScheme.light, .dark])
    func bannersSitAboveTheLogAndKeepItsText(scheme: ColorScheme) throws {

        let plain = Offscreen.host(PanelPreview(state: .recording, scheme: scheme), scheme: scheme)
        let original = try #require(Offscreen.textView(in: plain)?.string)
        let russian = PanelText(language: .russian)
        for banner: PanelState.Banner in [.callAudioPreview(russian), .microphonePreview(russian), .diskFullPreview(russian), .callSilentPreview(russian)] {
            let host = Offscreen.host(PanelPreview(state: .problem(banner), scheme: scheme), scheme: scheme)
            #expect(host.fittingSize.height > plain.fittingSize.height)
            #expect(Offscreen.textView(in: host)?.string == original)
        }
    }

    @Test nonisolated func everyPhraseHasRussianAndEnglishText() {

        for phrase in PanelPhrase.allCases {
            let russian = PanelText(language: .russian)(phrase)
            let english = PanelText(language: .english)(phrase)
            #expect(russian != phrase.rawValue, "\(phrase)")
            #expect(english != phrase.rawValue, "\(phrase)")
            #expect(english != russian, "\(phrase)")
        }
        #expect(PanelText(language: .russian)(.callAudioTitle) == "Нет звука звонка")
        #expect(PanelText(language: .english)(.callAudioTitle) == "No call audio")
    }

    @Test nonisolated func aMissingKeyShowsTheKey() {

        #expect(PanelText(language: .english)("no.such.key") == "no.such.key")
    }

    @Test nonisolated func anAppBundleFindsItsResourcesInContentsResources() throws {

        let root = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: root) }
        let app = root.appendingPathComponent("Audelin.app")
        let bundle = app.appendingPathComponent("Contents/Resources/Audelin_PanelUI.bundle")
        try FileManager.default.createDirectory(at: bundle, withIntermediateDirectories: true)
        let plist = try PropertyListSerialization.data(
            fromPropertyList: ["CFBundleIdentifier": "test.audelin", "CFBundlePackageType": "APPL"],
            format: .xml, options: 0
        )
        try plist.write(to: app.appendingPathComponent("Contents/Info.plist"))

        var usedFallback = false
        let found = panelBundle(mainBundleURL: app) { usedFallback = true; return .main }
        #expect(!usedFallback)
        #expect(found.bundleURL.standardizedFileURL == bundle.standardizedFileURL)
    }
}
