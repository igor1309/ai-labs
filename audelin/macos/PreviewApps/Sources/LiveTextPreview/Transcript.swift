import PanelUI

/// What the panel shows of the tracks heard so far: each track's segments,
/// as entries in time order.
struct Transcript: Equatable {

    /// A segment as Live text reports it.
    struct Line: Equatable {

        var id: Int
        var start: Double
        var settled: String
        var pending: String
    }

    private(set) var tracks: [PanelState.Speaker: [Line]] = [:]

    mutating func update(_ speaker: PanelState.Speaker, _ lines: [Line]) {

        tracks[speaker] = lines
    }

    /// Both tracks' lines by start, «я» first at the same time.
    var entries: [PanelState.Entry] {

        let all: [(speaker: PanelState.Speaker, line: Line)] = tracks.flatMap { speaker, lines in
            lines.map { (speaker, $0) }
        }
        let track = { (speaker: PanelState.Speaker) in speaker == .me ? 0 : 1 }
        return all
            .sorted { ($0.line.start, track($0.speaker)) < ($1.line.start, track($1.speaker)) }
            .map { speaker, line in
                PanelState.Entry(
                    id: line.id * 2 + track(speaker),
                    time: clock(line.start),
                    speaker: speaker,
                    settled: line.settled,
                    pending: line.pending
                )
            }
    }
}

/// Seconds as the gutter shows them, e.g. "01:07".
func clock(_ seconds: Double) -> String {

    let whole = Int(seconds)
    return String(format: "%02d:%02d", whole / 60, whole % 60)
}
