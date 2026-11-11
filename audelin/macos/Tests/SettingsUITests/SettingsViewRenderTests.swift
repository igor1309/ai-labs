import RenderedText
import SwiftUI
import Testing
@testable import SettingsUI

@MainActor
struct SettingsViewRenderTests {

    @Test(arguments: [ColorScheme.light, .dark])
    func shortPagesFillTheScrollViewportWithThePageBackground(scheme: ColorScheme) throws {
        var state = SettingsState.release
        // Loading is shorter than either populated tab, leaving ample empty viewport.
        state.selectedTab = .callNotes
        state.callNotes = .loading("Загружаем настройки…")
        let host = Offscreen.host(
            SettingsScrollView(state: state, event: { _ in }).environment(\.colorScheme, scheme),
            size: CGSize(width: 620, height: 700), scheme: scheme
        )
        let image = try #require(Offscreen.snapshot(host))
        let page = try #require(image.colorAt(x: 4, y: 4)?.usingColorSpace(.deviceRGB))
        let empty = try #require(image.colorAt(x: 4, y: image.pixelsHigh - 4)?.usingColorSpace(.deviceRGB))
        #expect(abs(page.redComponent - empty.redComponent) < 0.01)
        #expect(abs(page.greenComponent - empty.greenComponent) < 0.01)
        #expect(abs(page.blueComponent - empty.blueComponent) < 0.01)
        try Offscreen.save(image, "settings-scroll-\(scheme == .dark ? "dark" : "light")")
    }

    @Test(arguments: [ColorScheme.light, .dark])
    func scrollingPageUsesTheInheritedWindowAppearance(scheme: ColorScheme) throws {
        let host = Offscreen.host(
            SettingsScrollView(state: .release, event: { _ in }),
            size: CGSize(width: 620, height: 700), scheme: scheme
        )
        let image = try #require(Offscreen.snapshot(host))
        let actual = try #require(image.colorAt(x: 4, y: 4)?.usingColorSpace(.deviceRGB))
        let reference = Offscreen.host(
            SettingsConfig.glassLedger.tokens(for: scheme).win,
            size: CGSize(width: 20, height: 20), scheme: scheme
        )
        let referenceImage = try #require(Offscreen.snapshot(reference))
        let expected = try #require(referenceImage.colorAt(x: 4, y: 4)?.usingColorSpace(.deviceRGB))
        #expect(abs(actual.redComponent - expected.redComponent) < 0.01)
        #expect(abs(actual.greenComponent - expected.greenComponent) < 0.01)
        #expect(abs(actual.blueComponent - expected.blueComponent) < 0.01)
    }

    @Test(arguments: [SettingsState.release, SettingsState.duringRecording])
    func reportsPageHeightRatherThanTheOversizedViewport(state: SettingsState) {
        var heights: [CGFloat] = []
        let host = Offscreen.host(
            SettingsScrollView(state: state, event: { _ in }, contentHeightChanged: { heights.append($0) }),
            size: CGSize(width: 620, height: 900), scheme: .light
        )
        host.layoutSubtreeIfNeeded()
        RunLoop.main.run(until: Date(timeIntervalSinceNow: 0.1))
        #expect(heights.last != nil)
        if let height = heights.last {
            #expect(height > 300)
            #expect(height < 650)
        }
    }

    @Test func reportsNewHeightWhenSwitchingToAShorterPage() throws {
        var heights: [CGFloat] = []
        let report: (CGFloat) -> Void = { heights.append($0) }
        let host = Offscreen.host(
            SettingsScrollView(state: .release, event: { _ in }, contentHeightChanged: report),
            size: CGSize(width: 620, height: 900), scheme: .light
        )
        RunLoop.main.run(until: Date(timeIntervalSinceNow: 0.1))
        let recordingHeight = try #require(heights.last)
        var loading = SettingsState.release
        loading.selectedTab = .callNotes
        loading.callNotes = .loading("Загружаем настройки…")
        host.rootView = SettingsScrollView(state: loading, event: { _ in }, contentHeightChanged: report)
        host.layoutSubtreeIfNeeded()
        RunLoop.main.run(until: Date(timeIntervalSinceNow: 0.1))
        let loadingHeight = try #require(heights.last)
        #expect(loadingHeight < recordingHeight)
        #expect(loadingHeight > 70)
    }

    @Test nonisolated func exportRegistryContainsExactlyTheRequiredStates() {
        let required: Set<String> = [
            "release", "debug", "confirm-move", "moving", "move-failed", "during-recording",
            "general-system", "general-fallback", "general-english", "general-russian",
            "summaries-off", "summaries-on", "summaries-local", "summaries-invalid", "summaries-unavailable",
            "summaries-validating", "summaries-saving", "summaries-save-failed", "summaries-saved",
            "summaries-loading", "summaries-load-failed", "summaries-no-fallback",
        ]
        #expect(Set(SettingsState.previews.map(\.name)) == required)
        #expect(SettingsState.previews.count == required.count)
    }

    @Test(arguments: [ColorScheme.light, .dark], SettingsLanguage.allCases)
    func everyPreviewFillsTheWindow(scheme: ColorScheme, language: SettingsLanguage) throws {

        let text = SettingsText(language: language)
        for (name, state) in SettingsState.previews(in: text) {

            let host = Offscreen.host(SettingsPreview(state: state, scheme: scheme, text: text), scheme: scheme)
            let image = try #require(Offscreen.snapshot(host), "\(name) did not render")
            #expect(host.bounds.width == SettingsConfig.glassLedger.windowWidth + 2 * SettingsConfig.glassLedger.light.space24, "\(name)")
            #expect(host.bounds.height > 0, "\(name)")

            try Offscreen.save(image, "settings-\(name)-\(scheme == .dark ? "dark" : "light")\(language == .russian ? "" : "-en")")
        }
    }
}
