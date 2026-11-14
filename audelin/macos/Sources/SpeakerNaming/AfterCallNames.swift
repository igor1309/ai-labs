/// One stretch of a diarized speaker, from the after-call pass over the call track.
public struct DiarizedTurn: Equatable, Sendable {
    public var speaker: Int
    public var start: Double
    public var end: Double
    public init(speaker: Int, start: Double, end: Double) { self.speaker = speaker; self.start = start; self.end = end }
}

/// What the call app showed over the whole recording: who was there and who spoke when.
public struct CallEvidence: Equatable, Sendable {
    public var roster: [String]
    public var spoken: [Spoken]
    public var through: Double

    public init(roster: [String], spoken: [Spoken], through: Double) {
        self.roster = roster; self.spoken = spoken; self.through = through
    }

    public struct Spoken: Equatable, Sendable {
        public var name: String
        public var start: Double
        public var end: Double?
        public init(name: String, start: Double, end: Double?) { self.name = name; self.start = start; self.end = end }
    }
}

/// Matches the after-call diarization against what the call app showed, and names each
/// remote row by the cluster it overlaps most. Only confirmed clusters give a name.
public enum AfterCallNames {

    /// The indicator lags speech and is polled; each interval edge is trusted only this far.
    public static let uncertainty = 0.5

    public static func names(rows: [(id: Int, start: Double, end: Double)], turns: [DiarizedTurn],
                             evidence: CallEvidence) -> [Int: String] {
        let clusters = clusterNames(turns: turns, evidence: evidence)
        var result: [Int: String] = [:]
        for row in rows {
            var share: [Int: Double] = [:]
            for turn in turns { share[turn.speaker, default: 0] += max(0, min(row.end, turn.end) - max(row.start, turn.start)) }
            guard let best = share.max(by: { $0.value < $1.value }), best.value > 0,
                  let name = clusters[best.key] else { continue }
            result[row.id] = name
        }
        return result
    }

    /// The name of each diarized speaker that the evidence confirms.
    public static func clusterNames(turns: [DiarizedTurn], evidence: CallEvidence) -> [Int: String] {
        // After the call the whole recording is the evidence window.
        var policy = Policy()
        policy.window = .infinity
        var naming = SpeakerNaming(policy: policy)
        naming.observe(roster: evidence.roster.map { Participant(id: $0, name: $0) })
        naming.observe(activities: evidence.spoken.map {
            Activity(participantID: $0.name, start: $0.start, end: $0.end, uncertainty: uncertainty)
        }, through: evidence.through)
        for (index, turn) in turns.enumerated() {
            let overlapped = turns.contains { $0.speaker != turn.speaker && $0.start < turn.end && turn.start < $0.end }
            naming.observe(turn: .init(id: "\(index)", cluster: "s\(turn.speaker)", start: turn.start, end: turn.end, overlapped: overlapped))
        }
        naming.advance()
        var result: [Int: String] = [:]
        for speaker in Set(turns.map(\.speaker)) {
            if let name = naming.name(of: "s\(speaker)") { result[speaker] = name }
        }
        return result
    }
}
