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
    var state = ReadingState(banners: banners, recording: .on(elapsed: "00:00:20"), log: .lines(lines),
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


/// The reducer under test, built from `spy`'s formatters.
func makeSUT() -> (sut: ReadingReducer, spy: ReadingFormattingSpy) {

    let spy = ReadingFormattingSpy(recordingTime: "stub recording time", lineTime: "stub line time", span: "stub span")
    return (ReadingReducer(recordingTime: spy.formatRecordingTime, lineTime: spy.formatLineTime, span: spy.formatSpan), spy)
}

final class ReadingFormattingSpy: Sendable {

    enum Call: Equatable {
        case recordingTime(Double)
        case lineTime(Double)
        case span(String, String)
    }

    let recordingTime: String
    let lineTime: String
    let span: String
    private let recorded = Mutex<[Call]>([])
    var calls: [Call] { recorded.withLock { $0 } }

    init(recordingTime: String, lineTime: String, span: String) {

        self.recordingTime = recordingTime
        self.lineTime = lineTime
        self.span = span
    }

    func formatRecordingTime(_ elapsed: Double) -> String {

        recorded.withLock { $0.append(.recordingTime(elapsed)) }
        return recordingTime
    }

    func formatLineTime(_ time: Double) -> String {

        recorded.withLock { $0.append(.lineTime(time)) }
        return lineTime
    }

    func formatSpan(_ start: String, _ end: String) -> String {

        recorded.withLock { $0.append(.span(start, end)) }
        return span
    }
}
