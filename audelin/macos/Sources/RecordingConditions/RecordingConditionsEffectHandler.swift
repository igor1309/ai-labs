/// Takes each condition whose value changed.
public protocol ConditionPublication: Sendable {
    func publish(_ condition: RecordingCondition, available: Bool) async
}

/// Hands each publication to its collaborator in a fixed condition order; it keeps nothing.
public struct RecordingConditionsEffectHandler: Sendable {

    private let publication: any ConditionPublication

    public init(publication: any ConditionPublication) { self.publication = publication }

    /// A publication completes with no event.
    public func handle(_ effect: RecordingConditionsEffect) async -> RecordingConditionsEvent? {
        switch effect {
        case let .publish(changed):
            for condition in RecordingCondition.allCases {
                if let available = changed[condition] { await publication.publish(condition, available: available) }
            }
            return nil
        }
    }
}
