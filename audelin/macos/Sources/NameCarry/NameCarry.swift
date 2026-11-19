/// Carries existing names between two remote-side speaker timelines.
/// Callers supply only the remote side; microphone speakers do not belong here.
public enum NameCarry {
    public struct TimeRange: Equatable, Sendable {
        public var start: Double
        public var end: Double

        public init(start: Double, end: Double) {
            self.start = start
            self.end = end
        }
    }

    public struct OldSpeaker: Equatable, Sendable {
        public var name: String?
        public var ranges: [TimeRange]

        public init(name: String?, ranges: [TimeRange]) {
            self.name = name
            self.ranges = ranges
        }
    }

    public struct NewSpeaker: Equatable, Sendable {
        public var id: Int
        public var ranges: [TimeRange]

        public init(id: Int, ranges: [TimeRange]) {
            self.id = id
            self.ranges = ranges
        }
    }

    /// Missing entries mean no name. Each speaker's time is the union of its ranges,
    /// so repeated or overlapping ranges never count twice. Invalid timelines and
    /// ambiguous pairings carry nothing, as do duplicate new-speaker IDs.
    public static func names(old: [OldSpeaker], new: [NewSpeaker]) -> [Int: String] {
        let oldTimes = old.map { timeline($0.ranges) }
        let newTimes = new.map { timeline($0.ranges) }
        let oldDurations = oldTimes.map(duration)
        let newDurations = newTimes.map(duration)
        var matches = [(old: Int, new: Int)]()
        var oldCounts = Array(repeating: 0, count: old.count)
        var newCounts = Array(repeating: 0, count: new.count)

        for oldIndex in old.indices {
            guard let name = old[oldIndex].name, !name.isEmpty else { continue }
            for newIndex in new.indices {
                let shared = overlap(oldTimes[oldIndex], newTimes[newIndex])
                guard shared > oldDurations[oldIndex] / 2,
                      shared > newDurations[newIndex] / 2 else { continue }
                matches.append((oldIndex, newIndex))
                oldCounts[oldIndex] += 1
                newCounts[newIndex] += 1
            }
        }

        let idCounts = Dictionary(new.map { ($0.id, 1) }, uniquingKeysWith: +)
        var result = [Int: String]()
        for match in matches {
            // Concurrent speakers can make several mutual majorities possible;
            // choosing by input order would turn ambiguous timing into a name.
            guard oldCounts[match.old] == 1, newCounts[match.new] == 1,
                  idCounts[new[match.new].id] == 1 else { continue }
            result[new[match.new].id] = old[match.old].name
        }
        return result
    }

    private static func timeline(_ ranges: [TimeRange]) -> [TimeRange] {
        guard ranges.allSatisfy({ $0.start.isFinite && $0.end.isFinite && $0.end >= $0.start }) else {
            return []
        }
        let sorted = ranges.filter { $0.end > $0.start }.sorted { $0.start < $1.start }
        var merged = [TimeRange]()
        for range in sorted {
            if let last = merged.last, range.start <= last.end {
                merged[merged.count - 1].end = max(last.end, range.end)
            } else {
                merged.append(range)
            }
        }
        guard duration(merged).isFinite else { return [] }
        return merged
    }

    private static func duration(_ ranges: [TimeRange]) -> Double {
        ranges.reduce(0) { $0 + ($1.end - $1.start) }
    }

    private static func overlap(_ old: [TimeRange], _ new: [TimeRange]) -> Double {
        var oldIndex = 0
        var newIndex = 0
        var shared = 0.0
        while oldIndex < old.count && newIndex < new.count {
            let left = old[oldIndex]
            let right = new[newIndex]
            shared += max(0, min(left.end, right.end) - max(left.start, right.start))
            if left.end <= right.end {
                oldIndex += 1
            } else {
                newIndex += 1
            }
        }
        return shared
    }
}
