/// Tentative names for rows while the call runs, straight from the call app's indicator.
///
/// A row gets the remote participant shown speaking, alone, over most of it; overlap,
/// nobody shown or too short a row leave it unnamed. Once given, a row's name never
/// changes during the call: only the after-call pass replaces it.
public struct LiveNames: Sendable {
    public var minimumSeconds = 1.0
    public var share = 0.6
    private var given: [String: String] = [:]

    public init() {}

    /// `uncertainty` trims each interval's edges (the indicator's lag and polling).
    public mutating func name(
        row: String, start: Double, end: Double,
        roster: [Participant], activities: [Activity], through: Double
    ) -> String? {
        if let name = given[row] { return name }
        let upper = min(end, through)
        guard upper - start >= minimumSeconds else { return nil }
        let people = Dictionary(roster.map { ($0.id, $0) }, uniquingKeysWith: { $1 })
        let spans = activities.compactMap { activity -> (String, Double, Double)? in
            let a = activity.start + activity.uncertainty
            let b = min(activity.end ?? through, through) - activity.uncertainty
            return b > a ? (activity.participantID, a, b) : nil
        }
        let edges = Set([start, upper] + spans.flatMap { [$0.1, $0.2] }.filter { $0 > start && $0 < upper }).sorted()
        var alone: [String: Double] = [:]
        for (a, b) in zip(edges, edges.dropFirst()) {
            let mid = (a + b) / 2
            let active = Set(spans.filter { $0.1 <= mid && mid < $0.2 }.map(\.0))
            guard active.count == 1, let id = active.first, people[id]?.isLocal == false else { continue }
            alone[id, default: 0] += b - a
        }
        guard let best = alone.max(by: { $0.value < $1.value }), best.value / (upper - start) >= share,
              let name = people[best.key]?.name else { return nil }
        given[row] = name
        return name
    }
}
