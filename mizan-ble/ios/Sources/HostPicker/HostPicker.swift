/// Times are nondecreasing seconds from the same monotonic origin.
/// The caller supplies validated settings and maps its host identities to `HostID`.
public struct HostPicker<HostID: Hashable & Sendable>: Sendable {
    public enum Answer: Equatable, Sendable {
        case host(HostID)
        case holdCloser
        case none
    }

    public struct View: Equatable, Sendable {
        public let leaderAverage: Double?
        public let candidateCount: Int
    }

    public func view(at time: Double) -> View {
        let live = candidates.values.filter { time - $0.last < fade }
        return View(leaderAverage: live.map(\.average).max(), candidateCount: live.count)
    }

    private struct Candidate: Sendable {
        var average: Double
        let first: Double
        var last: Double
        var readings: Int
    }

    private let alpha: Double
    private let windowSeconds: Double
    private let windowReadings: Int
    private let floor: Double
    private let margin: Double
    private let fade: Double
    private var candidates: [HostID: Candidate] = [:]

    public init(
        alpha: Double, windowSeconds: Double, windowReadings: Int,
        floor: Double, margin: Double, fade: Double
    ) {
        self.alpha = alpha
        self.windowSeconds = windowSeconds
        self.windowReadings = windowReadings
        self.floor = floor
        self.margin = margin
        self.fade = fade
    }

    @discardableResult
    public mutating func receive(host: HostID, rssi: Int, at time: Double) -> Answer {
        expire(at: time)
        if rssi != 127 {
            if var candidate = candidates[host] {
                candidate.average = alpha * Double(rssi) + (1 - alpha) * candidate.average
                candidate.last = time
                candidate.readings += 1
                candidates[host] = candidate
            } else {
                candidates[host] = Candidate(average: Double(rssi), first: time, last: time, readings: 1)
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
        guard let leader = candidates.max(by: { $0.value.average < $1.value.average }) else {
            return .none
        }
        guard time - leader.value.first >= windowSeconds,
              leader.value.readings >= windowReadings,
              leader.value.average > floor,
              candidates.allSatisfy({
                  $0.key == leader.key || leader.value.average - $0.value.average > margin
              })
        else { return .holdCloser }
        return .host(leader.key)
    }
}
