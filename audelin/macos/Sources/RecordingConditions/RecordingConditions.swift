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

/// What is published for a condition. Only the calls folder can be moving:
/// a folder move holds it, which is not the same as the folder being lost.
public enum Availability: Equatable, Sendable {

    case available, unavailable, moving
}

public struct RecordingConditionsState: Equatable, Sendable {

    /// The latest readings; nil until one arrives.
    public var readings: ConditionReadings?
    /// The latest published call-audio access; nil until one arrives.
    public var callAudioAccess: Bool?
    /// A folder move holds the calls folder.
    public var storageMoving: Bool
    /// How many moves have started; numbers the reading each move's end asks for.
    public var moves: UInt64
    /// The move whose end asked for a reading not yet arrived; the folder stays moving until it does.
    public var awaitedReading: UInt64?
    /// The value last published for each condition.
    public var published: [RecordingCondition: Availability]

    public init(
        readings: ConditionReadings? = nil, callAudioAccess: Bool? = nil,
        storageMoving: Bool = false, moves: UInt64 = 0, awaitedReading: UInt64? = nil,
        published: [RecordingCondition: Availability] = [:]
    ) {
        self.readings = readings
        self.callAudioAccess = callAudioAccess
        self.storageMoving = storageMoving
        self.moves = moves
        self.awaitedReading = awaitedReading
        self.published = published
    }
}

public enum RecordingConditionsEvent: Equatable, Sendable {

    /// Readings taken before the latest ones are stale and change nothing.
    case read(ConditionReadings)
    case callAudioAccess(Bool)
    /// A move took the calls folder (true) or let it go (false).
    case storageMoving(Bool)
    /// The reading asked for when the given move let the folder go.
    case readAfterMove(ConditionReadings, move: UInt64)
}

public enum RecordingConditionsEffect: Equatable, Sendable {

    /// Each condition whose value changed, with its new value.
    case publish([RecordingCondition: Availability])
    /// Read the microphone and the disk for the end of the given move.
    case readAfterMove(UInt64)
}

public struct RecordingConditionsReducer: Sendable {

    public init() {}

    public func reduce(_ state: RecordingConditionsState, _ event: RecordingConditionsEvent) -> (RecordingConditionsState, RecordingConditionsEffect?) {

        var state = state
        switch event {
        case let .read(readings):
            guard take(readings, into: &state) else { return (state, nil) }
        case let .readAfterMove(readings, move):
            if state.awaitedReading == move, !state.storageMoving { state.awaitedReading = nil }
            if !take(readings, into: &state), state.awaitedReading != nil || state.storageMoving { return (state, nil) }
        case let .callAudioAccess(published): state.callAudioAccess = published
        case .storageMoving(true):
            guard !state.storageMoving else { return (state, nil) }
            state.storageMoving = true
            state.moves += 1
            state.awaitedReading = nil
        case .storageMoving(false):
            guard state.storageMoving else { return (state, nil) }
            state.storageMoving = false
            state.awaitedReading = state.moves
            return (state, .readAfterMove(state.moves))
        }
        let changed = values(of: state).filter { state.published[$0.key] != $0.value }
        guard !changed.isEmpty else { return (state, nil) }
        state.published.merge(changed) { $1 }
        return (state, .publish(changed))
    }

    /// Keeps readings unless older than the latest; returns whether it kept them.
    private func take(_ readings: ConditionReadings, into state: inout RecordingConditionsState) -> Bool {

        if let latest = state.readings, readings.takenAt < latest.takenAt { return false }
        state.readings = readings
        return true
    }

    private func values(of state: RecordingConditionsState) -> [RecordingCondition: Availability] {

        var values: [RecordingCondition: Availability] = [:]
        values[.microphoneAccess] = state.readings.map { $0.microphoneAccess ? .available : .unavailable }
        values[.callAudioAccess] = state.callAudioAccess.map { $0 ? .available : .unavailable }
        if let disk = state.readings?.disk {
            values[.callsFolder] = disk.folderExists && disk.writable ? .available : .unavailable
            values[.room] = hasRoom(disk) ? .available : .unavailable
        }
        if state.storageMoving || state.awaitedReading != nil { values[.callsFolder] = .moving }
        return values
    }
}
