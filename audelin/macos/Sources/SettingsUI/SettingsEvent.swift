/// What the user can do in the Settings window.
public enum SettingsEvent: Equatable, Sendable {

    case setRecordsCalls(Bool)
    case setLiveText(Bool)
    /// Pick a new calls folder.
    case changeFolder
    case confirmMove
    case cancelMove
    /// Resume a failed move from the call that failed.
    case retryMove
    case selectEngine(SettingsState.Engine.ID)
    /// Seconds; debug builds only.
    case selectChunk(Int)
}
