import SwiftUI

extension SettingsState {

    /// One state per design frame, named after it, in Russian.
    static let previews = previews(in: SettingsText(language: .russian))

    /// One state per design frame, named after it; the Recording tab's states carry text in the given language.
    static func previews(in text: SettingsText) -> [(name: String, state: SettingsState)] {

        let english = text.language == .english
        let base = release(in: text)
        let move = CallsMove(destination: "~/Documents/Audelin", calls: 52, bytes: 135_000_000, movedCalls: 31, movedBytes: 81_000_000)
        return [
            ("release", base),
            ("debug", with(base) { $0.chunk = .init(options: [2, 3, 4, 6, 8], selected: 4, releaseDefault: 4) }),
            ("confirm-move", with(base) {
                $0.moveConfirm = .init(title: text(.moveTitle, move.calls, text.size(move.bytes)),
                                       body: text(.moveBody, move.calls, text.size(move.bytes), move.destination))
            }),
            ("moving", with(base) {
                $0.folder = .init(path: move.destination, status: .moving(done: 31.0 / 52, detail: text(
                    .moveDetail, move.movedCalls, move.calls, text.size(move.movedBytes), text.size(move.bytes))))
            }),
            ("move-failed", with(base) {
                $0.folder.status = .failed(moved: text(.moveMoved, move.movedCalls, move.calls),
                                           reason: english ? "“Zoom 2”: not enough disk space." : "«Zoom 2» — не удалось: нет места на диске.")
            }),
            ("during-recording", with(base) { $0.folder.status = .recording }),
            ("general-system", general(.system, hint: text(.languageHintSystem), base: base, in: text)),
            ("general-fallback", general(.system, hint: text(.languageHintFallback, "Deutsch"), base: base, in: text)),
            ("general-english", general(.english, hint: text(.languageHintForced, "Русский"), base: base, in: text)),
            ("general-russian", general(.russian, hint: text(.languageHintForced, "English"), base: base, in: text)),
        ] + summaryPreviews(in: text)
    }

    static let release = release(in: SettingsText(language: .russian))
    static let debug = previews[1].state
    static let confirmMove = previews[2].state
    static let moving = previews[3].state
    static let moveFailed = previews[4].state
    static let duringRecording = previews[5].state

    static func release(in text: SettingsText) -> SettingsState {

        let english = text.language == .english
        return SettingsState(
            recordsCalls: true,
            liveText: true,
            folder: .init(path: "~/Recordings/Audelin", status: .idle(calls: english ? "52 calls · 135 MB of audio" : "52 звонка · аудио 135 MB")),
            engines: [
                .init(id: "parakeet", name: "Parakeet v3",
                      note: english ? "faster; the same file as live text" : "быстрее; тот же файл, что и для живого текста",
                      availability: english ? "installed" : "есть", size: "461 MB"),
                .init(id: "whisper", name: "Whisper Large v3 Turbo",
                      note: english ? "more accurate on rare words, slower" : "точнее на редких словах, медленнее",
                      availability: english ? "installed · from Amanu" : "есть · из Amanu", size: "547 MB"),
            ],
            selectedEngine: "parakeet",
            explainKeys: "⌃⌥⌘E"
        )
    }

    /// The General tab with a language picked; appearance follows macOS.
    private static func general(_ language: General.Language, hint: String, base: SettingsState, in text: SettingsText) -> SettingsState {

        with(base) {
            $0.selectedTab = .general
            $0.general = .init(
                language: .init(segments: [.init(id: .system, title: text(.languageSystem)),
                                           .init(id: .russian, title: "Русский"), .init(id: .english, title: "English")],
                                selected: language, hint: hint),
                appearance: .init(segments: [.init(id: .system, title: text(.appearanceSystem)),
                                             .init(id: .light, title: text(.appearanceLight)),
                                             .init(id: .dark, title: text(.appearanceDark))],
                                  selected: .system, hint: text(.appearanceHint)))
        }
    }

    private struct CallsMove {
        let destination: String
        let calls: Int
        let bytes: Int64
        let movedCalls: Int
        let movedBytes: Int64
    }

    private static func with(_ state: SettingsState, _ change: (inout SettingsState) -> Void) -> SettingsState {

        var state = state
        change(&state)
        return state
    }
}

/// The window content over the desktop tint the design draws behind it.
struct SettingsPreview: View {

    let state: SettingsState
    let scheme: ColorScheme
    var config: SettingsConfig = .glassLedger
    var text = SettingsText(language: .russian)

    var body: some View {

        SettingsView(state: state, event: { _ in }, config: config, text: text)
            .padding(config.tokens(for: scheme).space24)
            .background(config.tokens(for: scheme).back)
            .environment(\.colorScheme, scheme)
    }
}

#Preview("Release") { SettingsPreview(state: .release, scheme: .light) }
#Preview("Debug") { SettingsPreview(state: .debug, scheme: .light) }
#Preview("Confirm move") { SettingsPreview(state: .confirmMove, scheme: .light) }
#Preview("Moving") { SettingsPreview(state: .moving, scheme: .light) }
#Preview("Move failed") { SettingsPreview(state: .moveFailed, scheme: .light) }
#Preview("During a recording") { SettingsPreview(state: .duringRecording, scheme: .light) }
#Preview("General") { SettingsPreview(state: SettingsState.previews.first { $0.name == "general-system" }!.state, scheme: .light) }
#Preview("Release, dark") { SettingsPreview(state: .release, scheme: .dark) }
#Preview("Move failed, dark") { SettingsPreview(state: .moveFailed, scheme: .dark) }
