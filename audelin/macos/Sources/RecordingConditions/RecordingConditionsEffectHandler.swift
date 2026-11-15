/// Takes each condition whose value changed.
public protocol ConditionPublication: Sendable {
    func publish(_ condition: RecordingCondition, _ availability: Availability) async
}

/// Hands each publication to its collaborator in a fixed condition order, and
/// reads the microphone and disk when a move ends; it keeps nothing.
public struct RecordingConditionsEffectHandler: Sendable {

    private let publication: any ConditionPublication
    private let read: @Sendable () async -> ConditionReadings

    /// `read` takes the microphone permission and the disk at this moment.
    public init(publication: any ConditionPublication, read: @escaping @Sendable () async -> ConditionReadings) {
        self.publication = publication
        self.read = read
    }

    /// A publication completes with no event; a reading after a move, with that reading.
    public func handle(_ effect: RecordingConditionsEffect) async -> RecordingConditionsEvent? {
        switch effect {
        case let .publish(changed):
            for condition in RecordingCondition.allCases {
                if let availability = changed[condition] { await publication.publish(condition, availability) }
            }
            return nil
        case let .readAfterMove(move):
            return .readAfterMove(await read(), move: move)
        }
    }
}
