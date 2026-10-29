public enum MenuBarRecording: Equatable, Sendable {

    case idle(automatic: Bool, unavailable: Set<MenuBarBlocker>, failure: String?)
    case recording(call: Bool, faults: Set<MenuBarFault>)
    case ending(faults: Set<MenuBarFault>)
}

public enum MenuBarBlocker: CaseIterable, Hashable, Sendable {

    case microphone, callAudio, folder, space
}

public struct MenuBarPreferences: Equatable, Sendable {

    public let automatic: Bool
    public let liveText: Bool

    public init(automatic: Bool, liveText: Bool) {

        self.automatic = automatic
        self.liveText = liveText
    }
}

public enum MenuBarFault: CaseIterable, Hashable, Sendable {

    case microphone, callAudio, diskFull
}
