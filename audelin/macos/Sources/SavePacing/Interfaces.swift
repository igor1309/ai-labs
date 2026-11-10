public protocol Saving<Value>: Sendable {

    associatedtype Value: Sendable

    /// Returns once the complete value is kept.
    func save(_ value: Value) async throws
}

public protocol FailureReport: Sendable {

    func saveFailed(_ error: any Error) async
}
