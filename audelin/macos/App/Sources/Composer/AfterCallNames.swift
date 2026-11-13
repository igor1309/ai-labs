import CallDiarizer
import SpeakerNaming

/// Matches the after-call diarization against what Zoom showed, and names each remote row
/// by the cluster it overlaps most. Only confirmed clusters give a name.
enum AfterCallNames {

    static func names(rows: [(id: Int, start: Double, end: Double)], turns: [CallDiarizer.Turn],
                      board: LiveNameBoard.Names) -> [Int: String] {

        let clusters = clusterNames(turns: turns, board: board)
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

    /// The name of each diarized speaker that the Zoom evidence confirms.
    static func clusterNames(turns: [CallDiarizer.Turn], board: LiveNameBoard.Names) -> [Int: String] {

        // After the call the whole recording is the evidence window.
        var policy = Policy()
        policy.window = .infinity
        var naming = SpeakerNaming(policy: policy)
        naming.observe(roster: board.roster.map { Participant(id: $0, name: $0) })
        naming.observe(activities: board.spoken.map {
            Activity(participantID: $0.name, start: $0.start, end: $0.end, uncertainty: CallLiveNames.uncertainty)
        }, through: board.through)
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
