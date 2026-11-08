public enum MenuBarUpdateItem: Equatable, Sendable {
    case absent, active, disabled(String)
}

public enum MenuBarAction: Equatable, Sendable {

    case start, stop, restartTapped
    case setAutomatic(Bool), setLiveText(Bool)
    case showPanel, hidePanel, showCalls, showSettings, openCallsFolder, quit
}

public enum MenuBarEntry: Equatable, Sendable {

    case restart(String, reason: String?)
    case separator
    case stateLine(String)
    case button(String, MenuBarAction)
    case toggle(String, checked: Bool, MenuBarAction)
}

public struct MenuBarModel: Equatable, Sendable {

    public let item: MenuBarItem
    public let entries: [MenuBarEntry]
    public let updateBadge: Bool

    public init(recording: MenuBarRecording, preferences: MenuBarPreferences, statusLine: String? = nil,
                offersPanelReopen: Bool = false, panelVisible: Bool = false,
                updateBadge: Bool = false, updateItem: MenuBarUpdateItem = .absent) {

        item = .from(recording, liveText: preferences.liveText)
        self.updateBadge = updateBadge
        var entries: [MenuBarEntry] = []
        switch updateItem {
        case .absent: break
        case .active: entries = [.restart("Перезапустить для обновления", reason: nil), .separator]
        case let .disabled(reason): entries = [.restart("Перезапустить для обновления", reason: reason), .separator]
        }
        entries.append(.stateLine(statusLine ?? item.stateLine))
        switch recording {
        case let .idle(_, unavailable, _) where unavailable.isEmpty:
            entries.append(.button("Начать запись", .start))
        case .recording:
            entries.append(.button("Остановить запись", .stop))
            if offersPanelReopen && !panelVisible { entries.append(.button("Показать панель", .showPanel)) }
        default: break
        }
        if panelVisible {
            entries.append(.button("Скрыть панель", .hidePanel))
        }
        entries += [
            .toggle("Записывать звонки автоматически", checked: preferences.automatic,
                    .setAutomatic(!preferences.automatic)),
            .toggle("Живой текст", checked: preferences.liveText, .setLiveText(!preferences.liveText)),
            .button("Звонки…", .showCalls),
            .button("Настройки…", .showSettings),
            .button("Открыть папку звонков", .openCallsFolder),
            .button("Выйти", .quit),
        ]
        self.entries = entries
    }
}
