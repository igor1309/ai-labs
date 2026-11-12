import Foundation

/// What the calls window shows of one call's notes.
public struct CallNotesState: Equatable, Sendable {

    public enum Status: Equatable, Sendable {
        case none
        case making
        /// The notes and when they were made, as shown.
        case made(text: String, date: String)
        /// Why making failed, as shown.
        case failed(reason: String)
    }

    public var status: Status

    public init(status: Status) { self.status = status }
}

public enum CallNotesEvent: Equatable, Sendable {
    case make
    case cancel
    case retry
    case made(text: String, date: Date)
    case failed(reason: String)
}

public enum CallNotesEffect: Equatable, Sendable {
    case make
    case stop
}

/// Keeps no clock: how long making may take belongs to the collaborator.
public struct CallNotesReducer: Sendable {

    private let date: @Sendable (Date) -> String

    /// `date` renders when the notes were made.
    public init(date: @escaping @Sendable (Date) -> String) { self.date = date }

    public func reduce(_ state: CallNotesState, _ event: CallNotesEvent) -> (CallNotesState, CallNotesEffect?) {

        switch (state.status, event) {
        case (.none, .make), (.failed, .retry):
            (.init(status: .making), .make)
        case (.making, .cancel):
            (.init(status: .none), .stop)
        case let (.making, .made(text, made)):
            (.init(status: .made(text: text, date: date(made))), nil)
        case let (.making, .failed(reason)):
            (.init(status: .failed(reason: reason)), nil)
        default:
            (state, nil)
        }
    }
}
