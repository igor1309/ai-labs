/// Times are nondecreasing seconds from the same monotonic origin.
public struct HostChoice<HostID: Hashable & Sendable>: Sendable {
    public enum Band: Equatable, Sendable {
        case aboveFloor
        case betweenLines
        case belowDrop(since: Double)
    }

    public enum Signal: Equatable, Sendable {
        case noHost
        case noLeader
        case leader(HostID, Band)
    }

    public enum Answer: Equatable, Sendable {
        case host(HostID)
        case holdCloser
        case none
    }

    private let hold: Double
    public private(set) var chosen: HostID?

    public init(hold: Double) {
        self.hold = hold
    }

    @discardableResult
    public mutating func receive(_ signal: Signal, at time: Double) -> Answer {
        if case let .leader(host, band) = signal, host == chosen {
            switch band {
            case .aboveFloor, .betweenLines:
                return .host(host)
            case let .belowDrop(since):
                if time - since < hold { return .host(host) }
            }
        }

        chosen = nil
        if case let .leader(host, .aboveFloor) = signal {
            chosen = host
            return .host(host)
        }
        return signal == .noHost ? .none : .holdCloser
    }
}
