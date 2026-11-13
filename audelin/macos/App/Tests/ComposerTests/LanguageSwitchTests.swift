import MenuBar
import PanelUI
import Preferences
import SettingsUI
import Session
import Observation
import Testing
@testable import Composer

/// A language change shows the menu bar and the panel in the new language at once.
@Suite(.timeLimit(.minutes(1)))
struct LanguageSwitchTests {

    @MainActor
    @Test func menuBarTextFollowsTheLanguage() async throws {
        try await withComposition { rig in
            #expect(rig.menu.menu.entries.contains(.button(MenuBarText(language: .russian)(.quit), .quit)))
            await rig.menu.languageChanged(.english)
            #expect(rig.menu.language == .english)
            #expect(rig.menu.menu.entries.contains(.button(MenuBarText(language: .english)(.quit), .quit)))
            #expect(rig.menu.panelText == PanelText(language: .english))
        }
    }

    @MainActor
    @Test func settingsCallNotesTextFollowsTheLanguage() async throws {
        try await withComposition { rig in
            let settings = try #require(rig.menu.summarySettings)
            for await state in Observations({ settings.snapshot }) where state.phase == .saved { break }
            #expect(settings.snapshot.message == SettingsText(language: .russian).settingsMessage(.saved))
            await rig.menu.languageChanged(.english)
            for await state in Observations({ settings.snapshot })
            where state.message == SettingsText(language: .english).settingsMessage(.saved) { break }
            #expect(settings.snapshot.phase == .saved)
        }
    }

    @MainActor
    @Test func panelMapsWhatItShowsAgainInTheNewLanguage() async throws {
        let clock = FixtureClock(), text = AsyncStream<CallState>.makeStream()
        let panel = AudelinPanel(now: clock.time.monotonicNow, ticks: clock.ticks, sink: TestLogSink(), intervals: testIntervals, browser: { nil }, sleep: { _ in })
        let reading = await panel.begin(id: 1, text: text.stream, enableLiveText: {})
        reading.sessionChanged(SessionState(health: [.access(.microphone): .accessLost], phase: .recording))
        var shown = await panel.states().makeAsyncIterator()
        while let state = await shown.next(), state.banners != [.microphone] {}
        await panel.languageChanged(PanelText(language: .english))
        while let state = await shown.next() {
            guard case let .liveTextOff(kept?) = state.log, case let .gap(gap)? = kept.rows.first else { continue }
            #expect(!gap.text.contains("микрофон"))
            #expect(gap.text.contains("00:00"))
            break
        }
        text.continuation.finish()
        await reading.end()
        await panel.end(id: 1)
        clock.finish()
    }
}

/// The General tab's language picker saves the choice and switches Audelin live.
@MainActor
@Suite(.timeLimit(.minutes(1)))
struct LanguageSettingTests {

    @Test func choosingALanguageSavesItAndSwitchesAtOnce() async throws {
        try await withComposition { rig in
            #expect(rig.menu.language == .russian)
            #expect(rig.menu.settingsState.selectedTab == .general)
            #expect(rig.menu.settingsState.general.language.selected == .system)
            #expect(rig.menu.settingsState.general.language.hint == SettingsText(language: .russian)(.languageHintSystem))
            await rig.menu.sendSettings(.selectLanguage(.english))
            #expect(rig.menu.language == .english)
            #expect(PreferencesStore(fileURL: rig.root.appendingPathComponent("preferences.json")).read().language == .english)
            let general = rig.menu.settingsState.general
            #expect(general.language.selected == .english)
            #expect(general.language.hint == "macOS uses Русский.")
            #expect(general.language.segments.map(\.title) == ["System", "Русский", "English"])
        }
    }

    @Test func aSavedChoiceIsShownFromLaunch() async throws {
        try await withComposition(preferences: { root in
            var saved = Preferences(automaticRecording: false, liveText: true, callsFolder: root)
            saved.language = .english
            return saved
        }) { rig in
            #expect(rig.menu.language == .english)
            #expect(rig.menu.panelText == PanelText(language: .english))
            #expect(rig.menu.settingsState.general.language.selected == .english)
        }
    }

    @Test func systemFallsBackToEnglishAndNamesTheMacOSLanguage() async throws {
        try await withComposition(configure: { $0.preferredLanguages = { ["de-DE"] } }) { rig in
            #expect(rig.menu.language == .english)
            #expect(rig.menu.settingsState.general.language.hint == "Now English: Audelin has no Deutsch, the macOS language.")
            await rig.menu.sendSettings(.selectLanguage(.russian))
            #expect(rig.menu.language == .russian)
            #expect(rig.menu.settingsState.general.language.hint == "Язык macOS — Deutsch.")
        }
    }

    @Test(arguments: [("de", "Deutsch"), ("ru-RU", "Русский"), ("en-GB", "English"), ("fr", "Français")])
    func languagesAreNamedInTheirOwnLanguage(identifier: String, name: String) {
        #expect(languageName(identifier) == name)
    }
}

/// The General tab's appearance picker saves the choice and applies it at once.
@MainActor
@Suite(.timeLimit(.minutes(1)))
struct AppearanceSettingTests {

    @Test func choosingAnAppearanceSavesItAndShowsIt() async throws {
        try await withComposition { rig in
            #expect(rig.menu.appearance == .system)
            #expect(rig.menu.settingsState.general.appearance.selected == .system)
            #expect(rig.menu.settingsState.general.appearance.hint == SettingsText(language: .russian)(.appearanceHint))
            await rig.menu.sendSettings(.selectAppearance(.dark))
            #expect(rig.menu.appearance == .dark)
            #expect(PreferencesStore(fileURL: rig.root.appendingPathComponent("preferences.json")).read().appearance == .dark)
            let appearance = rig.menu.settingsState.general.appearance
            #expect(appearance.selected == .dark)
            #expect(appearance.hint == "Всегда тёмное, что бы ни было в macOS.")
            #expect(appearance.segments.allSatisfy { $0.isEnabled })
        }
    }

    @Test func aSavedAppearanceIsShownFromLaunch() async throws {
        try await withComposition(preferences: { root in
            var saved = Preferences(automaticRecording: false, liveText: true, callsFolder: root)
            saved.appearance = .light
            return saved
        }) { rig in
            #expect(rig.menu.appearance == .light)
            #expect(rig.menu.settingsState.general.appearance.selected == .light)
        }
    }
}
