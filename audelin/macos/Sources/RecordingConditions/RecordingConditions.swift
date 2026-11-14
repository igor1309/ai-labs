/// A condition recording needs before it may start.
public enum RecordingCondition: CaseIterable, Hashable, Sendable {

    case microphoneAccess
    case callAudioAccess
    case callsFolder
    case room
}

public struct RecordingConditionsState: Equatable, Sendable {

    /// The latest microphone permission answer; nil until one arrives.
    public var microphoneAccess: Bool?
    /// The latest published call-audio access; nil until one arrives.
    public var callAudioAccess: Bool?
    /// The latest disk readings; nil until one arrives.
    public var disk: DiskReadings?
    /// While calls storage moves, the calls folder is unavailable.
    public var storageMoving: Bool
    /// The value last published for each condition.
    public var published: [RecordingCondition: Bool]

    public init(
        microphoneAccess: Bool? = nil, callAudioAccess: Bool? = nil, disk: DiskReadings? = nil,
        storageMoving: Bool = false, published: [RecordingCondition: Bool] = [:]
    ) {
        self.microphoneAccess = microphoneAccess
        self.callAudioAccess = callAudioAccess
        self.disk = disk
        self.storageMoving = storageMoving
        self.published = published
    }
}

public enum RecordingConditionsEvent: Equatable, Sendable {

    case microphoneRead(Bool)
    case diskRead(DiskReadings)
    case callAudioAccess(Bool)
    case storageMoving(Bool)
}

public enum RecordingConditionsEffect: Equatable, Sendable {

    /// Each condition whose value changed, with its new value.
    case publish([RecordingCondition: Bool])
}

public struct RecordingConditionsReducer: Sendable {

    public init() {}

    public func reduce(_ state: RecordingConditionsState, _ event: RecordingConditionsEvent) -> (RecordingConditionsState, RecordingConditionsEffect?) {

        var state = state
        switch event {
        case let .microphoneRead(authorized): state.microphoneAccess = authorized
        case let .diskRead(readings): state.disk = readings
        case let .callAudioAccess(published): state.callAudioAccess = published
        case let .storageMoving(moving): state.storageMoving = moving
        }
        let changed = values(of: state).filter { state.published[$0.key] != $0.value }
        guard !changed.isEmpty else { return (state, nil) }
        state.published.merge(changed) { $1 }
        return (state, .publish(changed))
    }

    private func values(of state: RecordingConditionsState) -> [RecordingCondition: Bool] {

        var values: [RecordingCondition: Bool] = [:]
        values[.microphoneAccess] = state.microphoneAccess
        values[.callAudioAccess] = state.callAudioAccess
        if let disk = state.disk {
            values[.callsFolder] = disk.folderExists && disk.writable && !state.storageMoving
            values[.room] = hasRoom(disk)
        } else if state.storageMoving {
            values[.callsFolder] = false
        }
        return values
    }
}
