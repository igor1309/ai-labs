import MenuBar
import PanelUI
import Session
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
    @Test func panelMapsWhatItShowsAgainInTheNewLanguage() async throws {
        let clock = FixtureClock(), text = AsyncStream<CallState>.makeStream()
        let panel = AudelinPanel(now: clock.time.monotonicNow, ticks: clock.ticks, sink: TestLogSink(), intervals: testIntervals)
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
        await reading.end()
        await panel.end(id: 1)
        text.continuation.finish()
        clock.finish()
    }
}
