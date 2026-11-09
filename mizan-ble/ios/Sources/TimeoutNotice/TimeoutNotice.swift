public enum TimeoutNotice {
    /// How long a notice shows.
    public static let seconds = 30

    public struct Notice: Hashable, Sendable {
        public let number: UInt64

        public init(number: UInt64) {
            self.number = number
        }
    }

    public struct State: Equatable, Sendable {
        /// The notice drawn now, or nil when none shows.
        public fileprivate(set) var showing: Notice?
        /// The newest timeout accepted, kept after its notice hides.
        public fileprivate(set) var newest: Notice?

        public init() {}
    }

    public enum Event: Equatable, Sendable {
        case timedOut(Notice), acted, elapsed(Notice)
    }

    public enum Effect: Equatable, Sendable {
        case start(Notice, seconds: Int), stop(Notice)
    }

    /// The end of a started wait comes back from the root as `elapsed`; a stopped one never ends.
    @MainActor public protocol Timer {
        func start(seconds: Int, for notice: Notice)
        func stop(_ notice: Notice)
    }

    public static func reduce(_ state: State, _ event: Event) -> (State, Effect?) {
        var next = state
        switch event {
        case .timedOut(let notice):
            if let newest = state.newest, notice.number <= newest.number {
                return (state, nil)
            }
            next.showing = notice
            next.newest = notice
            return (next, .start(notice, seconds: seconds))
        case .elapsed(let notice) where state.showing == notice:
            next.showing = nil
        case .acted:
            if let notice = state.showing {
                next.showing = nil
                return (next, .stop(notice))
            }
        default:
            break
        }
        return (next, nil)
    }

    @MainActor public final class EffectHandler {
        private let timer: any Timer

        public init(timer: any Timer) {
            self.timer = timer
        }

        /// Calls the timer before returning, and returns a stream that finishes with no event.
        public func handle(_ effect: Effect) -> AsyncStream<Event> {
            switch effect {
            case .start(let notice, let seconds):
                timer.start(seconds: seconds, for: notice)
            case .stop(let notice):
                timer.stop(notice)
            }
            return AsyncStream { $0.finish() }
        }
    }
}
