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
    /// Numbers each run of making, so an outcome from a cancelled run is told apart.
    public var run: Int

    public init(status: Status, run: Int = 0) { self.status = status; self.run = run }
}

public enum CallNotesEvent: Equatable, Sendable {
    case make
    case cancel
    case retry
    case made(run: Int, text: String, date: Date)
    case failed(run: Int, reason: String)
}

public enum CallNotesEffect: Equatable, Sendable {
    case make(run: Int)
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
            (.init(status: .making, run: state.run + 1), .make(run: state.run + 1))
        case (.making, .cancel):
            (.init(status: .none, run: state.run), .stop)
        case let (.making, .made(run, text, made)) where run == state.run:
            (.init(status: .made(text: text, date: date(made)), run: run), nil)
        case let (.making, .failed(run, reason)) where run == state.run:
            (.init(status: .failed(reason: reason), run: run), nil)
        default:
            (state, nil)
        }
    }
}

/// What making a call's notes ended with.
public enum CallNotesOutcome: Equatable, Sendable {
    case made(text: String, date: Date)
    case failed(reason: String)
}

/// Makes one call's notes. It owns how long making may take and fails when it
/// takes too long.
public protocol CallNotesMaking: Sendable {

    /// Returns once the notes are made or making failed.
    func make() async -> CallNotesOutcome
    /// Stops making. A `make` it stopped may still return; that outcome is ignored.
    func stop() async
}

public struct CallNotesEffectHandler: Sendable {

    private let making: any CallNotesMaking

    public init(making: any CallNotesMaking) { self.making = making }

    /// Delivers the event that completes the effect, if any, then finishes.
    public func handle(_ effect: CallNotesEffect) -> AsyncStream<CallNotesEvent> {

        AsyncStream { output in
            let task = Task {
                switch effect {
                case let .make(run):
                    switch await making.make() {
                    case let .made(text, date): output.yield(.made(run: run, text: text, date: date))
                    case let .failed(reason): output.yield(.failed(run: run, reason: reason))
                    }
                case .stop:
                    await making.stop()
                }
                output.finish()
            }
            output.onTermination = { _ in task.cancel() }
        }
    }
}
