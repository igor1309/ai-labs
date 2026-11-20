import Synchronization
import Reading
import Testing

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
    var state = ReadingState(banners: banners, recording: .on(elapsed: "recording(20.0)"), captureBegan: true, log: .lines(lines),
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



/// Records the consumer's calls and returns the test's layout result.
final class RenderingSpy: Sendable {
    enum Call: Equatable, Sendable { case recording(Double), line(Double) }
    struct LayoutCall: Equatable, Sendable {
        var value: ReadingLayout
        var change: ReadingLayout.Change
    }
    private let storage = Mutex<[Call]>([])
    private let layouts = Mutex<[LayoutCall]>([])
    private let result: (@Sendable (inout ReadingLayout) -> Void)?
    var calls: [Call] { storage.withLock { $0 } }
    var layoutCalls: [LayoutCall] { layouts.withLock { $0 } }

    init(result: (@Sendable (inout ReadingLayout) -> Void)? = nil) { self.result = result }

    func recording(_ value: Double) -> String {
        storage.withLock { $0.append(.recording(value)) }
        return "recording(\(value))"
    }
    func line(_ value: Double) -> String {
        storage.withLock { $0.append(.line(value)) }
        return "line(\(value))"
    }
    func layout(_ value: inout ReadingLayout, _ change: ReadingLayout.Change) {
        layouts.withLock { $0.append(.init(value: value, change: change)) }
        result?(&value)
    }
}

func makeReducer(_ spy: RenderingSpy) -> ReadingReducer {
    .init(recordingTime: spy.recording, lineTime: spy.line, layout: spy.layout)
}

func assert(
    _ state: ReadingState, _ event: ReadingEvent, delivers effect: Never?, using reducer: ReadingReducer,
    sourceLocation: SourceLocation = #_sourceLocation, _ change: (inout ReadingState) -> Void = { _ in }
) {
    var expected = state
    change(&expected)
    let result = reducer.reduce(state, event)
    #expect(result.0 == expected, sourceLocation: sourceLocation)
    #expect(result.0.rendered.prepared == expected.rendered.prepared, sourceLocation: sourceLocation)
    #expect(result.0.rendered.ordered == expected.rendered.ordered, sourceLocation: sourceLocation)
    #expect(result.0.rendered.entries == expected.rendered.entries, sourceLocation: sourceLocation)
    #expect(result.0.rendered.locations == expected.rendered.locations, sourceLocation: sourceLocation)
    #expect(result.0.lines.layout == expected.lines.layout, sourceLocation: sourceLocation)
    #expect(result.0.anchors.sealed == expected.anchors.sealed, sourceLocation: sourceLocation)
    #expect(result.0.text.sealed == expected.text.sealed, sourceLocation: sourceLocation)
    #expect(result.0.rendered.entries.sealed == expected.rendered.entries.sealed, sourceLocation: sourceLocation)
    #expect(result.0.rendered.locations.sealed == expected.rendered.locations.sealed, sourceLocation: sourceLocation)
    #expect(result.0.rendered.inSealedRows == expected.rendered.inSealedRows, sourceLocation: sourceLocation)
    #expect(result.0.lines.rows.sealed == expected.lines.rows.sealed, sourceLocation: sourceLocation)
    #expect(logRevision(result.0.log) == logRevision(expected.log), sourceLocation: sourceLocation)
    #expect(result.1 == effect, sourceLocation: sourceLocation)
}

private func logRevision(_ log: ReadingState.Log) -> Int? {
    switch log {
    case let .lines(lines): lines.layout
    case let .liveTextOff(kept): kept?.layout
    case .empty, .preparing: nil
    }
}
