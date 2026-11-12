import Foundation

/// What the calls window shows of one call's notes.
public enum CallNotesState: Equatable, Sendable {
    /// The call has no notes.
    case pending
    case loading
    case completed(Notes)
    case failure(Failure)

    /// The notes and when they were made, as shown.
    public struct Notes: Equatable, Sendable {
        public let text: String
        public let date: String
        public init(text: String, date: String) { self.text = text; self.date = date }
    }
}

/// Why making the notes failed, as shown.
public struct Failure: Error, Equatable, Sendable {
    public let reason: String
    public init(reason: String) { self.reason = reason }
}

public enum CallNotesEvent: Equatable, Sendable {
    /// The user asked to make the notes, first or again.
    case load
    case cancel
    case loaded(Result<Loaded, Failure>)

    /// The notes as made, and when.
    public struct Loaded: Equatable, Sendable {
        public let text: String
        public let date: Date
        public init(text: String, date: Date) { self.text = text; self.date = date }
    }
}

public enum CallNotesEffect: Equatable, Sendable {
    case load
    case cancel
}

/// Keeps no clock: how long making may take belongs to the collaborator.
public struct CallNotesReducer: Sendable {

    private let date: @Sendable (Date) -> String

    /// `date` renders when the notes were made.
    public init(date: @escaping @Sendable (Date) -> String) { self.date = date }

    public func reduce(_ state: CallNotesState, _ event: CallNotesEvent) -> (CallNotesState, CallNotesEffect?) {

        switch (state, event) {
        case (.pending, .load), (.failure, .load):
            (.loading, .load)
        case (.loading, .cancel):
            (.pending, .cancel)
        case let (.loading, .loaded(.success(loaded))):
            (.completed(.init(text: loaded.text, date: date(loaded.date))), nil)
        case let (.loading, .loaded(.failure(failure))):
            (.failure(failure), nil)
        default:
            (state, nil)
        }
    }
}

public struct CallNotesEffectHandler {

    public typealias LoadCompletion = (Result<CallNotesEvent.Loaded, Failure>) -> Void
    /// Makes the call's notes. A load that `cancel` stopped never completes.
    public typealias Load = (@escaping LoadCompletion) -> Void
    public typealias Cancel = () -> Void

    private let load: Load
    private let cancel: Cancel

    public init(load: @escaping Load, cancel: @escaping Cancel) { self.load = load; self.cancel = cancel }

    public typealias Dispatch = (CallNotesEvent) -> Void

    public func handleEffect(_ effect: CallNotesEffect, _ dispatch: @escaping Dispatch) {

        switch effect {
        case .load: load { dispatch(.loaded($0)) }
        case .cancel: cancel()
        }
    }
}
