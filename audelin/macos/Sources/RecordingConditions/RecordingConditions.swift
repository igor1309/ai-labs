/// A condition recording needs before it may start.
public enum RecordingCondition: CaseIterable, Hashable, Sendable {

    case microphoneAccess
    case callAudioAccess
    case callsFolder
    case room
}

/// The microphone permission and the disk, read together at one moment.
public struct ConditionReadings: Equatable, Sendable {

    public var microphoneAccess: Bool
    public var disk: DiskReadings
    /// When the readings were taken, on a monotonic clock.
    public var takenAt: Double

    public init(microphoneAccess: Bool, disk: DiskReadings, takenAt: Double) {
        self.microphoneAccess = microphoneAccess
        self.disk = disk
        self.takenAt = takenAt
    }
}

public struct RecordingConditionsState: Equatable, Sendable {

    /// The latest readings; nil until one arrives.
    public var readings: ConditionReadings?
    /// The latest published call-audio access; nil until one arrives.
    public var callAudioAccess: Bool?
    /// While calls storage moves, the calls folder is unavailable.
    public var storageMoving: Bool
    /// The value last published for each condition.
    public var published: [RecordingCondition: Bool]

    public init(
        readings: ConditionReadings? = nil, callAudioAccess: Bool? = nil,
        storageMoving: Bool = false, published: [RecordingCondition: Bool] = [:]
    ) {
        self.readings = readings
        self.callAudioAccess = callAudioAccess
        self.storageMoving = storageMoving
        self.published = published
    }
}

public enum RecordingConditionsEvent: Equatable, Sendable {

    /// Readings taken before the latest ones are stale and change nothing.
    case read(ConditionReadings)
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
        case let .read(readings):
            if let latest = state.readings, readings.takenAt < latest.takenAt { return (state, nil) }
            state.readings = readings
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
        values[.microphoneAccess] = state.readings?.microphoneAccess
        values[.callAudioAccess] = state.callAudioAccess
        if let disk = state.readings?.disk {
            values[.callsFolder] = disk.folderExists && disk.writable && !state.storageMoving
            values[.room] = hasRoom(disk)
        } else if state.storageMoving {
            values[.callsFolder] = false
        }
        return values
    }
}
