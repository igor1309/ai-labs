import SwiftUI

extension SettingsState {

    /// One state per design frame, named after it.
    static let previews: [(name: String, state: SettingsState)] = [
        ("release", .release),
        ("debug", .debug),
        ("confirm-move", .confirmMove),
        ("moving", .moving),
        ("move-failed", .moveFailed),
        ("during-recording", .duringRecording),
    ]

    static let release = SettingsState(
        recordsCalls: true,
        liveText: true,
        folder: .init(path: "~/Recordings/Audelin", status: .idle(calls: "52 звонка · аудио 135 MB")),
        engines: [
            .init(id: "parakeet", name: "Parakeet v3", note: "быстрее; тот же файл, что и для живого текста", availability: "есть", size: "461 MB"),
            .init(id: "whisper", name: "Whisper Large v3 Turbo", note: "точнее на редких словах, медленнее", availability: "есть · из Amanu", size: "547 MB"),
        ],
        selectedEngine: "parakeet",
        explainKeys: "⌃⌥⌘E"
    )

    static let debug = with(release) {
        $0.chunk = .init(options: [2, 3, 4, 6, 8], selected: 4, releaseDefault: 4)
    }

    static let confirmMove = with(release) {
        $0.moveConfirm = .init(
            title: "Перенести 52 звонка (135 MB)?",
            body: "Из ~/Recordings/Audelin в ~/Documents/Audelin, по одному звонку. Пока идёт перенос, запись не начнётся."
        )
    }

    static let moving = with(release) {
        $0.folder = .init(path: "~/Documents/Audelin", status: .moving(done: 96.0 / 140, detail: "31 из 52 · 81 из 135 MB"))
    }

    static let moveFailed = with(release) {
        $0.folder.status = .failed(moved: "Перенесено 31 из 52", reason: "«Zoom 2» — не удалось: нет места на диске.")
    }

    static let duringRecording = with(release) {
        $0.folder.status = .recording
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

    var body: some View {

        SettingsView(state: state, event: { _ in }, config: config)
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
#Preview("Release, dark") { SettingsPreview(state: .release, scheme: .dark) }
#Preview("Move failed, dark") { SettingsPreview(state: .moveFailed, scheme: .dark) }
