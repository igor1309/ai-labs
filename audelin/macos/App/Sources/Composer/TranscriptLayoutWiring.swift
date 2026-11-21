import Reading
import TranscriptLayout

/// The concrete layout stays at the root; Reading receives only its own port.
func readingReducer() -> ReadingReducer {
    ReadingReducer(recordingTime: ReadingFormatting.recordingTime,
                   lineTime: TranscriptLayoutFormatting.lineTime, layout: layOutTranscript)
}

private func layOutTranscript(_ value: inout ReadingLayout, _ change: ReadingLayout.Change) {
    let layout = TranscriptLayout(lineTime: TranscriptLayoutFormatting.lineTime, span: TranscriptLayoutFormatting.span)
    var storage = ReadingLayoutStorage(value: value)
    switch change {
    case .prepare: layout.prepare(&storage)
    case let .text(update):
        layout.update(&storage, entries: update.entries, replacing: update.status == .listening,
                      newlyFinal: update.finalCount - update.from)
    case .rebuild: layout.rebuild(&storage)
    }
    value = storage.value
}

/// Translates individual accesses, leaving the call's sealed arrays and dictionaries shared.
private struct ReadingLayoutStorage: LayoutStorage {
    typealias Key = ReadingTextUpdate.Entry.ID
    typealias Text = ReadingTextUpdate.Entry
    typealias Entry = ReadingState.Entry
    typealias Gap = ReadingProblem.Kind

    var value: ReadingLayout
    let gaps: [GapMarker<Gap>]

    init(value: ReadingLayout) {
        self.value = value
        gaps = value.problems.map { .init(began: $0.began, content: $0.kind) }
    }
    var prepared: Bool {
        get { value.rendered.prepared }
        set { value.rendered.prepared = newValue }
    }
    var ordered: [Key] {
        get { value.rendered.ordered }
        _modify { yield &value.rendered.ordered }
        set { value.rendered.ordered = newValue }
    }
    var inSealedRows: Int {
        get { value.rendered.inSealedRows }
        set { value.rendered.inSealedRows = newValue }
    }
    var nextDisplayID: Int {
        get { value.nextDisplayID }
        set { value.nextDisplayID = newValue }
    }
    var revision: Int {
        get { value.revision }
        set { value.revision = newValue }
    }
    var textValues: [Text] { value.text.values }
    var tailKeys: [Key] { Array(value.text.tail.keys) }
    var tailLocations: [Location] { value.rendered.locations.tail.values.map { .init(row: $0.row, lateEntry: $0.lateEntry) } }
    var rowCount: Int { value.rows.count }
    var sealedRowCount: Int { value.rows.sealed.count }

    func timing(_ text: Text) -> EntryTiming<Key> {
        .init(id: text.id, start: text.start, end: text.end, writtenLater: text.writtenLater)
    }
    func display(_ text: Text, anchor: Anchor, time: String) -> Entry {
        .init(id: anchor.id, time: time, speaker: text.id.speaker,
              settled: text.settled, pending: text.pending)
    }
    func text(_ key: Key) -> Text? { value.text[key] }
    func anchor(_ key: Key) -> Anchor? { value.anchors[key].map { .init(id: $0.id, start: $0.start) } }
    func entry(_ key: Key) -> Entry? { value.rendered.entries[key] }
    func location(_ key: Key) -> Location? { value.rendered.locations[key].map { .init(row: $0.row, lateEntry: $0.lateEntry) } }
    func row(_ index: Int) -> LayoutRow<Entry, Gap> {
        switch value.rows[index] {
        case let .entry(entry): .entry(entry)
        case let .late(group): .late(span: group.span, entries: group.entries)
        case let .gap(gap): .gap(gap.kind, time: gap.time)
        }
    }
    mutating func setText(_ key: Key, _ text: Text) { value.text[key] = text }
    mutating func setAnchor(_ key: Key, _ anchor: Anchor) { value.anchors[key] = .init(id: anchor.id, start: anchor.start) }
    mutating func setEntry(_ key: Key, _ entry: Entry) { value.rendered.entries[key] = entry }
    mutating func setLocation(_ key: Key, _ location: Location) {
        let translated = ReadingState.Rendered.Location(row: location.row, lateEntry: location.lateEntry)
        if value.text.isSealed(key) {
            if value.rendered.locations[key] != translated { value.rendered.locations.setSealed(key, translated) }
        } else { value.rendered.locations[key] = translated }
    }
    mutating func remove(_ key: Key) {
        value.anchors[key] = nil
        value.text[key] = nil
        value.rendered.entries[key] = nil
        value.rendered.locations[key] = nil
    }
    mutating func seal(_ key: Key) {
        value.anchors.seal(key)
        value.text.seal(key)
        value.rendered.entries.seal(key)
    }
    mutating func sealLocation(_ key: Key) { value.rendered.locations.seal(key) }
    mutating func clearLocations(keepingSealed: Bool) {
        if keepingSealed { value.rendered.locations.removeTail() }
        else { value.rendered.locations.removeAll() }
    }
    mutating func setRow(_ index: Int, _ row: LayoutRow<Entry, Gap>) { value.rows[index] = translate(row) }
    mutating func appendRow(_ row: LayoutRow<Entry, Gap>) { value.rows.append(translate(row)) }
    mutating func replaceRows(keepingSealed: Bool, tail: [LayoutRow<Entry, Gap>]) {
        value.rows = .init(sealed: keepingSealed ? value.rows.sealed : [], tail: tail.map(translate))
    }
    mutating func sealRows(upTo count: Int) { value.rows.seal(upTo: count) }

    private func translate(_ row: LayoutRow<Entry, Gap>) -> ReadingState.Row {
        switch row {
        case let .entry(entry): return .entry(entry)
        case let .late(span, entries): return .late(.init(span: span, entries: entries))
        case let .gap(kind, time):
            let speaker: ReadingState.Speaker = switch kind {
            case .callAudio, .callSilent: .theirs
            case .microphone: .mine
            case let .diskFull(side): side
            }
            return .gap(.init(speaker: speaker, time: time, kind: kind))
        }
    }
}
