import Foundation

/// What the user can do in the live panel.
public enum PanelEvent: Equatable, Sendable {

    public enum SettingsPane: Equatable, Sendable {

        case microphone, systemAudioRecording
    }

    case openSettings(SettingsPane)
    case openCallsFolder
    case start
    case stop
    case switchLiveTextOn
    /// A selection was finished: hold it beside the others.
    case hold(PanelState.Held)
    case letGo(PanelState.Held)
    /// The reader scrolled to, or away from, the newest line. The model echoes
    /// a supplied identity in its snapshot even when following is unchanged.
    case scrolled(atBottom: Bool, interaction: UUID? = nil)
    /// Follow the newest lines again.
    case jumpToLive
}
