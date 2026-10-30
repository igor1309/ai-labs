/// Times are nondecreasing seconds from the same monotonic origin.
/// The caller supplies validated settings and maps its host identities to `HostID`.
public struct HostPicker<HostID: Hashable & Sendable>: Sendable {
    public enum Band: Equatable, Sendable {
        case aboveFloor
        case betweenLines
        case belowDrop(since: Double)
    }

    public struct Leader: Equatable, Sendable {
        public let host: HostID
        public let band: Band

        public init(host: HostID, band: Band) {
            self.host = host
            self.band = band
        }
    }

    public struct Answer: Equatable, Sendable {
        public let time: Double
        public let hostHeard: Bool
        public let leader: Leader?

        public init(time: Double, hostHeard: Bool, leader: Leader?) {
            self.time = time
            self.hostHeard = hostHeard
            self.leader = leader
        }
    }

    public struct View: Equatable, Sendable {
        public let strongestAverage: Double?
        public let candidateCount: Int
    }

    public func view(at time: Double) -> View {
        let live = candidates.values.filter { time - $0.last < fade }
        return View(strongestAverage: live.map(\.average).max(), candidateCount: live.count)
    }

    private struct Candidate: Sendable {
        var average: Double
        let first: Double
        var last: Double
        var readings: Int
        var belowDropSince: Double?
    }

    private let alpha: Double
    private let windowSeconds: Double
    private let windowReadings: Int
    private let floor: Double
    private let margin: Double
    private let fade: Double
    private let dropGap: Double
    private var candidates: [HostID: Candidate] = [:]

    public init(
        alpha: Double, windowSeconds: Double, windowReadings: Int,
        floor: Double, margin: Double, fade: Double, dropGap: Double
    ) {
        self.alpha = alpha
        self.windowSeconds = windowSeconds
        self.windowReadings = windowReadings
        self.floor = floor
        self.margin = margin
        self.fade = fade
        self.dropGap = dropGap
    }

    @discardableResult
    public mutating func receive(host: HostID, rssi: Int, at time: Double) -> Answer {
        expire(at: time)
        if rssi != 127 {
            if var candidate = candidates[host] {
                candidate.average = alpha * Double(rssi) + (1 - alpha) * candidate.average
                candidate.last = time
                candidate.readings += 1
                if candidate.average <= floor - dropGap {
                    if candidate.belowDropSince == nil { candidate.belowDropSince = time }
                } else {
                    candidate.belowDropSince = nil
                }
                candidates[host] = candidate
            } else {
                candidates[host] = Candidate(
                    average: Double(rssi), first: time, last: time, readings: 1,
                    belowDropSince: Double(rssi) <= floor - dropGap ? time : nil
                )
            }
        }
        return currentAnswer(at: time)
    }

    public mutating func answer(at time: Double) -> Answer {
        expire(at: time)
        return currentAnswer(at: time)
    }

    private mutating func expire(at time: Double) {
        candidates = candidates.filter { time - $0.value.last < fade }
    }

    private func currentAnswer(at time: Double) -> Answer {
        guard let strongest = candidates.max(by: { $0.value.average < $1.value.average }) else {
            return Answer(time: time, hostHeard: false, leader: nil)
        }
        guard time - strongest.value.first >= windowSeconds,
              strongest.value.readings >= windowReadings,
              candidates.allSatisfy({
                  $0.key == strongest.key || strongest.value.average - $0.value.average > margin
              })
        else { return Answer(time: time, hostHeard: true, leader: nil) }

        let band: Band
        if let since = strongest.value.belowDropSince {
            band = .belowDrop(since: since)
        } else if strongest.value.average > floor {
            band = .aboveFloor
        } else {
            band = .betweenLines
        }
        return Answer(time: time, hostHeard: true, leader: Leader(host: strongest.key, band: band))
    }
}
