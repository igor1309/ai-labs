import BlockingTestWork
import RenderedText
import SwiftUI
import Testing
@testable import SettingsUI

@MainActor
struct SettingsViewRenderTests {

    @Test(arguments: [ColorScheme.light, .dark])
    func everyPreviewFillsTheWindow(scheme: ColorScheme) throws {

        for (name, state) in SettingsState.previews {

            let host = Offscreen.host(SettingsPreview(state: state, scheme: scheme), scheme: scheme)
            let image = try #require(Offscreen.snapshot(host), "\(name) did not render")
            #expect(host.bounds.width > SettingsConfig.glassLedger.windowWidth, "\(name)")
            #expect(host.bounds.height > 0, "\(name)")

            try Offscreen.save(image, "settings-\(name)-\(scheme == .dark ? "dark" : "light")")
        }
    }

    @Test(arguments: [ColorScheme.light, .dark])
    func releaseShowsItsValuesAndNoTransientRows(scheme: ColorScheme) async throws {

        let text = try await rendered(.release, scheme)

        #expect(text.shows("Записывать звонки автоматически"), "\(text)")
        #expect(text.shows("~/Recordings/Audelin"), "\(text)")
        #expect(text.shows("52 звонка"), "\(text)")
        #expect(text.shows("Parakeet v3"), "\(text)")
        #expect(text.shows("Whisper Large v3 Turbo"), "\(text)")
        #expect(text.shows("461 MB"), "\(text)")
        #expect(text.shows("есть · из Amanu"), "\(text)")

        #expect(!text.shows("DEBUG"), "\(text)")
        #expect(!text.shows("Перенести"), "\(text)")
        #expect(!text.shows("Повторить"), "\(text)")
        #expect(!text.shows("идёт запись"), "\(text)")
    }

    @Test func debugAddsTheChunkPicker() async throws {

        let text = try await rendered(.debug, .light)

        #expect(text.shows("Размер фрагмента"), "\(text)")
        #expect(text.shows("DEBUG"), "\(text)")
        #expect(text.shows("В релизе — 4 с"), "\(text)")
    }

    @Test func moveConfirmationAsksWithItsTitleAndBody() async throws {

        let text = try await rendered(.confirmMove, .light)

        #expect(text.shows("Перенести 52 звонка"), "\(text)")
        #expect(text.shows("запись не начнётся"), "\(text)")
        #expect(text.shows("Отмена"), "\(text)")
    }

    @Test func movingShowsProgressInsteadOfTheCount() async throws {

        let text = try await rendered(.moving, .light)

        #expect(text.shows("31 из 52"), "\(text)")
        #expect(text.shows("~/Documents/Audelin"), "\(text)")
        #expect(!text.shows("аудио 135 MB"), "\(text)")
    }

    @Test(arguments: [ColorScheme.light, .dark])
    func failedMoveExplainsAndOffersARetry(scheme: ColorScheme) async throws {

        let text = try await rendered(.moveFailed, scheme)

        #expect(text.shows("часть звонков ещё здесь"), "\(text)")
        #expect(text.shows("Перенесено 31 из 52"), "\(text)")
        #expect(text.shows("нет места на диске"), "\(text)")
        #expect(text.shows("Повторить"), "\(text)")
    }

    @Test func aRecordingHoldsTheFolderChange() async throws {

        let text = try await rendered(.duringRecording, .light)

        #expect(text.shows("идёт запись"), "\(text)")
        #expect(!text.shows("52 звонка"), "\(text)")
    }

    @Test func readingForgivesLettersTheReaderMixesAcrossScripts() {

        #expect(RenderedText(lines: ["есть • из Аmапи"]).shows("есть · из Amanu"))
        #expect(!RenderedText(lines: ["есть"]).shows("есть · из Amanu"))
    }

    // MARK: - Helpers

    private func rendered(_ state: SettingsState, _ scheme: ColorScheme) async throws -> RenderedText {

        let host = Offscreen.host(SettingsPreview(state: state, scheme: scheme), scheme: scheme)
        let image = try #require(Offscreen.sharpSnapshot(host))
        return try await offPool { try readText(in: image) }
    }
}
