import Preferences
import Recording

public enum MenuBarAction: Equatable, Sendable {

    case start, stop
    case setAutomatic(Bool), setLiveText(Bool)
    case openCallsFolder, quit
}

public enum MenuBarEntry: Equatable, Sendable {

    case stateLine(String)
    case button(String, MenuBarAction)
    case toggle(String, checked: Bool, MenuBarAction)
}

public struct MenuBarModel: Equatable, Sendable {

    public let item: MenuBarItem
    public let entries: [MenuBarEntry]

    public init(state: RecordingState, preferences: Preferences, statusLine: String? = nil) {

        item = .from(state, liveText: preferences.liveText)
        var entries: [MenuBarEntry] = [.stateLine(statusLine ?? item.stateLine)]
        if state.phase == .idle, state.missing.isEmpty {
            entries.append(.button("Начать запись", .start))
        } else if state.phase == .beginning || state.phase == .recording {
            entries.append(.button("Остановить запись", .stop))
        }
        entries += [
            .toggle("Записывать звонки автоматически", checked: preferences.automaticRecording,
                    .setAutomatic(!preferences.automaticRecording)),
            .toggle("Живой текст", checked: preferences.liveText, .setLiveText(!preferences.liveText)),
            .button("Открыть папку звонков", .openCallsFolder),
            .button("Выйти", .quit),
        ]
        self.entries = entries
    }
}
