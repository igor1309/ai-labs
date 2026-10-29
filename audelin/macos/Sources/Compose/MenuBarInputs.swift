import MenuBar
import Preferences
import Recording

func menuBarRecording(_ state: RecordingState) -> MenuBarRecording {

    let faults = Set(state.faults.map { fault -> MenuBarFault in
        switch fault {
        case .microphone: .microphone
        case .callAudio: .callAudio
        case .diskFull: .diskFull
        }
    })
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
        return .recording(call: state.session?.origin == .call, faults: faults)
    case .ending:
        return .ending(faults: faults)
    }
}

func menuBarPreferences(_ preferences: Preferences) -> MenuBarPreferences {

    MenuBarPreferences(automatic: preferences.automaticRecording, liveText: preferences.liveText)
}
