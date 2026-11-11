/// What the user can do in the Settings window.
public enum SettingsEvent: Equatable, Sendable {

    case selectTab(SettingsState.Tab)
    case selectLanguage(SettingsState.General.Language)
    case selectAppearance(SettingsState.General.Appearance)
    case setAutomaticNotes(Bool)
    case setIdentifySpeakers(Bool)
    case selectNotesRuntime(SettingsState.NotesRuntime.Slot, SettingsState.NotesRuntime.Kind)
    case editNotesField(SettingsState.NotesRuntime.Slot, SettingsState.NotesField.ID, String)
    case notesAction(SettingsState.NotesAction.ID)

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
