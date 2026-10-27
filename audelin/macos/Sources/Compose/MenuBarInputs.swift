import MenuBar
import Preferences
import Recording

func menuBarRecording(_ state: RecordingState) -> MenuBarRecording {

    switch state.phase {
    case .idle:
        let unavailable = Set(state.missing.map { condition -> MenuBarBlocker in
            switch condition {
            case .microphoneAccess: .microphone
            case .callAudioAccess: .callAudio
            case .callsFolder: .folder
            case .room: .space
            }
        })
        return .idle(automatic: state.automatic, unavailable: unavailable, failure: state.cannotRecord)
    case .beginning, .recording:
        return .recording(call: state.session?.origin == .call)
    case .ending:
        return .ending
    }
}

func menuBarPreferences(_ preferences: Preferences) -> MenuBarPreferences {

    MenuBarPreferences(automatic: preferences.automaticRecording, liveText: preferences.liveText)
}
