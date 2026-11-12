import Synchronization
import Reading

/// A listening state whose text, anchors and rendered cache hold `entries` shown as `rows`.
///
/// Each entry's display id is its local id unless `displayIDs` gives one per entry in order.
/// The first `sealed` entries and rows are sealed; each sealed row is one entry.
func makeListening(
    entries: [ReadingTextUpdate.Entry], rows: [ReadingState.Row],
    problems: [ReadingProblem] = [], banners: [ReadingState.Banner] = [],
    displayIDs: [Int]? = nil, sealed: Int = 0
) -> ReadingState {

    let lines = ReadingState.Lines(rows: .init(tail: rows))
    var state = ReadingState(banners: banners, recording: .on(elapsed: "recording(20.0)"), log: .lines(lines),
                             problems: problems, status: .listening, nextDisplayID: entries.count,
                             lines: lines, rendered: .init(prepared: true))
    let ids = displayIDs ?? entries.map(\.id.localID)
    for (entry, id) in zip(entries, ids) {
        state.text[entry.id] = entry
        state.anchors[entry.id] = .init(id: id, start: entry.start)
    }
    let keys = Dictionary(uniqueKeysWithValues: zip(ids, entries.map(\.id)))
    func cache(_ entry: ReadingState.Entry, row: Int, lateEntry: Int? = nil) {

        let key = keys[entry.id]!
        state.rendered.ordered.append(key)
        state.rendered.entries[key] = entry
        state.rendered.locations[key] = .init(row: row, lateEntry: lateEntry)
    }
    for (row, value) in rows.enumerated() {
        switch value {
        case let .entry(entry): cache(entry, row: row)
        case let .late(group):
            for (index, entry) in group.entries.enumerated() { cache(entry, row: row, lateEntry: index) }
        case .gap: break
        }
    }
    guard sealed > 0 else { return state }
    for entry in entries.prefix(sealed) {
        state.text.seal(entry.id)
        state.anchors.seal(entry.id)
        state.rendered.entries.seal(entry.id)
        state.rendered.locations.seal(entry.id)
    }
    state.lines.rows.seal(upTo: sealed)
    state.rendered.inSealedRows = sealed
    state.log = .lines(state.lines)
    return state
}



/// Records each formatter call and returns a value that names the call.
final class RenderingSpy: Sendable {
    enum Call: Equatable, Sendable {
        case recording(Double), line(Double), span(String, String)
    }
    private let storage = Mutex<[Call]>([])
    var calls: [Call] { storage.withLock { $0 } }
    func recording(_ value: Double) -> String {

        storage.withLock { $0.append(.recording(value)) }
        return "recording(\(value))"
    }
    func line(_ value: Double) -> String {

        storage.withLock { $0.append(.line(value)) }
        return "line(\(value))"
    }
    func span(_ start: String, _ end: String) -> String {

        storage.withLock { $0.append(.span(start, end)) }
        return "span[\(start)|\(end)]"
    }
}

func makeReducer(_ spy: RenderingSpy) -> ReadingReducer {

    .init(recordingTime: { spy.recording($0) }, lineTime: { spy.line($0) }, span: { spy.span($0, $1) })
}

/// Each call with how many times it was made, for a reducer that renders a
/// whole layout by walking a dictionary, whose order changes from run to run.
func counted(_ calls: [RenderingSpy.Call]) -> [String: Int] {

    calls.reduce(into: [:]) { $0[String(describing: $1), default: 0] += 1 }
}

/// The rendered cache after the reducer prepared it: each shown entry, in order, and where its row is.
func prepared(
    _ shown: (ReadingTextUpdate.Entry.ID, ReadingState.Entry, ReadingState.Rendered.Location)...
) -> ReadingState.Rendered {

    .init(prepared: true, ordered: shown.map(\.0),
          entries: .init(uniqueKeysWithValues: shown.map { ($0.0, $0.1) }),
          locations: .init(uniqueKeysWithValues: shown.map { ($0.0, $0.2) }))
}
