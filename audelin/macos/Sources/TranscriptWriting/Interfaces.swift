public protocol CallText<Text>: Sendable {

    associatedtype Text: Sendable

    /// Acquiring the stream subscribes before start can publish text.
    /// Stop ends the stream after publishing its last complete text.
    var updates: AsyncStream<Text> { get }
    func start(enabled: Bool) async
    func setEnabled(_ enabled: Bool) async
    func stop() async
}

public protocol TextSaving<Text>: Sendable {

    associatedtype Text: Sendable

    /// Accepts text immediately, without waiting for a save.
    func submit(_ text: Text)

    /// Returns after the last submitted text is saved or its failure is told.
    func finish() async
}
