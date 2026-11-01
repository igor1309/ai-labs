import AppKit
import SwiftUI
import Testing
@testable import PanelUI

@MainActor
struct PanelBannerTests {

    @Test(arguments: [ColorScheme.light, .dark])
    func bannersSitAboveTheLogAndKeepItsText(scheme: ColorScheme) throws {

        let plain = Offscreen.host(PanelPreview(state: .recording, scheme: scheme), scheme: scheme)
        let original = try #require(Offscreen.textView(in: plain)?.string)
        for banner: PanelState.Banner in [.callAudio, .microphone, .diskFull(savedUntil: "12:45"), .callSilent] {
            let host = Offscreen.host(PanelPreview(state: .problem(banner), scheme: scheme), scheme: scheme)
            #expect(host.fittingSize.height > plain.fittingSize.height)
            #expect(Offscreen.textView(in: host)?.string == original)
        }
    }

    @Test func bannerCopyAndActionsDescribeEachProblem() {

        let cases: [(PanelState.Banner, String, String, String, PanelEvent)] = [
            (.callAudio, "Нет звука звонка",
             "Пишется только «я». Проверьте разрешение «Звук звонка».",
             "Открыть настройки macOS", .openSettings(.systemAudioRecording)),
            (.microphone, "Нет микрофона",
             "Пишутся только «они». Проверьте устройство ввода и разрешение «Микрофон».",
             "Открыть настройки macOS", .openSettings(.microphone)),
            (.diskFull(savedUntil: "12:45"), "Диск заполнен — дорожка остановлена",
             "Всё до 12:45 сохранено. Освободите место, чтобы продолжить.",
             "Открыть папку", .openCallsFolder),
            (.callSilent, "Звонок не слышен",
             "5 минут тишины со стороны «они», пока вы говорите. Проверьте разрешение «Звук звонка».",
             "Открыть настройки macOS", .openSettings(.systemAudioRecording)),
        ]
        for (banner, title, line, button, action) in cases {
            #expect(banner.title == title)
            #expect(banner.line == line)
            #expect(banner.button == button)
            #expect(banner.action == action)
        }
    }
}
