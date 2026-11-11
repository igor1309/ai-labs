public enum MenuBarAction: Equatable, Sendable {

    case start, stop
    case setAutomatic(Bool), setLiveText(Bool)
    case showPanel, hidePanel, showCalls, showSettings, openCallsFolder, quit

    /// SF Symbol shown beside the action's menu item, so every item carries an icon (LAB-1179).
    public var symbol: String {

        switch self {
        case .start: "record.circle"
        case .stop: "stop.circle"
        case .setAutomatic: "phone.badge.waveform"
        case .setLiveText: "text.bubble"
        case .showPanel: "macwindow"
        case .hidePanel: "rectangle.slash"
        case .showCalls: "list.bullet.rectangle"
        case .showSettings: "gearshape"
        case .openCallsFolder: "folder"
        case .quit: "power"
        }
    }
}

public enum MenuBarEntry: Equatable, Sendable {

    case stateLine(String)
    case divider
    case button(String, MenuBarAction)
    case toggle(String, checked: Bool, MenuBarAction)
}

public struct MenuBarModel: Equatable, Sendable {

    public let item: MenuBarItem
    public let entries: [MenuBarEntry]

    public init(text: (MenuBarPhrase) -> String, recording: MenuBarRecording, preferences: MenuBarPreferences,
                statusLine: String? = nil, offersPanelReopen: Bool = false, panelVisible: Bool = false) {

        item = .from(recording, liveText: preferences.liveText, text: text)
        // Sections, divided: state, recording, preferences, windows, quit (LAB-1179).
        var entries: [MenuBarEntry] = [.stateLine(statusLine ?? item.stateLine), .divider]
        switch recording {
        case let .idle(_, unavailable, _) where unavailable.isEmpty:
            entries.append(.button(text(.start), .start))
        case .recording:
            entries.append(.button(text(.stop), .stop))
            if offersPanelReopen && !panelVisible { entries.append(.button(text(.showPanel), .showPanel)) }
        default: break
        }
        if panelVisible {
            entries.append(.button(text(.hidePanel), .hidePanel))
        }
        if entries.last != .divider { entries.append(.divider) }
        entries += [
            .toggle(text(.automatic), checked: preferences.automatic,
                    .setAutomatic(!preferences.automatic)),
            .toggle(text(.liveText), checked: preferences.liveText, .setLiveText(!preferences.liveText)),
            .divider,
            .button(text(.calls), .showCalls),
            .button(text(.openCallsFolder), .openCallsFolder),
            .button(text(.settings), .showSettings),
            .divider,
            .button(text(.quit), .quit),
        ]
        self.entries = entries
    }
}
