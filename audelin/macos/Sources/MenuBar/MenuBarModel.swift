public enum MenuBarAction: Equatable, Sendable {

    case start, stop
    case setAutomatic(Bool), setLiveText(Bool)
    case showPanel, showCalls, openCallsFolder, quit
}

public enum MenuBarEntry: Equatable, Sendable {

    case stateLine(String)
    case button(String, MenuBarAction)
    case toggle(String, checked: Bool, MenuBarAction)
}

public struct MenuBarModel: Equatable, Sendable {

    public let item: MenuBarItem
    public let entries: [MenuBarEntry]

    public init(recording: MenuBarRecording, preferences: MenuBarPreferences, statusLine: String? = nil,
                offersPanelReopen: Bool = false) {

        item = .from(recording, liveText: preferences.liveText)
        var entries: [MenuBarEntry] = [.stateLine(statusLine ?? item.stateLine)]
        switch recording {
        case let .idle(_, unavailable, _) where unavailable.isEmpty:
            entries.append(.button("Начать запись", .start))
        case .recording:
            entries.append(.button("Остановить запись", .stop))
            if offersPanelReopen { entries.append(.button("Показать панель", .showPanel)) }
        default: break
        }
        entries += [
            .toggle("Записывать звонки автоматически", checked: preferences.automatic,
                    .setAutomatic(!preferences.automatic)),
            .toggle("Живой текст", checked: preferences.liveText, .setLiveText(!preferences.liveText)),
            .button("Звонки…", .showCalls),
            .button("Открыть папку звонков", .openCallsFolder),
            .button("Выйти", .quit),
        ]
        self.entries = entries
    }
}
