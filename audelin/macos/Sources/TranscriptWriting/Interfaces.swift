public protocol CallText<Text>: Sendable {

    associatedtype Text: Sendable

    /// Acquiring the stream subscribes before start can publish text.
    /// Stop ends the stream after publishing its last complete text.
    var updates: AsyncStream<Text> { get }
    func start(enabled: Bool) async
    func setEnabled(_ enabled: Bool) async
    func stop() async
}

public protocol Transcript<Text>: Sendable {

    associatedtype Text: Sendable

    /// Replaces the whole transcript; returns once that text can be read.
    func write(_ text: Text) async throws
}

public protocol FailureReport: Sendable {

    func transcriptFailed(_ error: any Error) async
}
