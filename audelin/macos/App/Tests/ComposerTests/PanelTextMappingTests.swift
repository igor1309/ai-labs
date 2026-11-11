import PanelUI
import Reading
import Synchronization
import Testing
@testable import Composer

struct PanelTextMappingTests {

    @Test func asksForNoTextWithoutBannersOrGaps() {

        let asked = Mutex<[PanelPhrase]>([])
        _ = panelState({ (phrase: PanelPhrase) -> String in asked.withLock { $0.append(phrase) }; return "" }, ReadingState())
        #expect(asked.withLock { $0 }.isEmpty)
    }

    @Test func fillsBannerAndGapFromTheGivenText() {

        let asked = Mutex<[PanelPhrase]>([])
        let state = ReadingState(
            banners: [.init(kind: .diskFull(.theirs), time: "12:45")],
            log: .liveTextOff(kept: .init(rows: [.gap(.init(speaker: .theirs, time: "12:45", kind: .diskFull(.theirs)))]))
        )
        let shown = panelState({ (phrase: PanelPhrase) -> String in asked.withLock { $0.append(phrase) }; return "<\(phrase.rawValue) %@>" }, state)

        #expect(Set(asked.withLock { $0 }) == [.openSettings, .diskFullTitle, .diskFullLine, .openFolder, .gapDiskFull])
        #expect(shown.banners == [.init(kind: .diskFull, title: "<banner.diskFull.title %@>",
                                        line: "<banner.diskFull.line 12:45>", button: "<banner.openFolder %@>",
                                        action: .openCallsFolder)])
        #expect(shown.log == .liveTextOff(kept: .init(rows: [.gap(.init(speaker: .them, text: "<gap.diskFull 12:45>"))])))
    }

    @Test func showsEnglishWhenGivenEnglishText() {

        let state = ReadingState(banners: [.init(kind: .callAudio, time: "12:45")])
        let shown = panelState(PanelText(language: .english).callAsFunction, state)
        #expect(shown.banners.map(\.title) == ["No call audio"])
        #expect(shown.banners.map(\.button) == ["Open macOS Settings"])
    }
}
