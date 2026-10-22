/// What the user can do in the live panel.
public enum PanelEvent: Equatable, Sendable {

    case start
    case stop
    case switchLiveTextOn
    /// Leave a held selection and follow the newest lines.
    case jumpToLive
}
