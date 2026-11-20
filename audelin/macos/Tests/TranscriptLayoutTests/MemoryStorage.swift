import SplitRows
import TranscriptLayout

struct Key: Hashable {
    var speaker: Int
    var localID: Int
    init(_ speaker: Int, _ localID: Int) { self.speaker = speaker; self.localID = localID }
    init(_ localID: Int) { self.init(0, localID) }
}

struct Text: Equatable {
    var id: Key
    var start: Double
    var end: Double
    var writtenLater: Bool
    var words: String

    init(_ id: Key, _ start: Double, end: Double? = nil, late: Bool = false, words: String = "words") {
        self.id = id
        self.start = start
        self.end = end ?? start + 1
        self.writtenLater = late
        self.words = words
    }
}

struct Shown: Equatable {
    var id: Int
    var time: String
    var speaker: Int
    var words: String
}


/// Caller-owned memory and reports of the storage accesses layout makes.
struct MemoryStorage: LayoutStorage {
    typealias Entry = Shown
    typealias Gap = String
    final class Reads { var text: [Key] = [] }
    let reads = Reads()
    var prepared = false
    var ordered: [Key] = []
    var inSealedRows = 0
    var nextDisplayID = 0
    var revision = 0
    var texts: [Key: Text] = [:]
    var anchors: [Key: Anchor] = [:]
    var entries: [Key: Shown] = [:]
    var locations: [Key: Location] = [:]
    var final: Set<Key> = []
    var finalLocations: Set<Key> = []
    var rows: SplitRows<LayoutRow<Shown, String>> = []
    var gaps: [GapMarker<String>] = []
    var textValues: [Text] { Array(texts.values) }
    var tailKeys: [Key] { texts.keys.filter { !final.contains($0) } }
    var tailLocations: [Location] { locations.filter { !finalLocations.contains($0.key) }.map(\.value) }
    var rowCount: Int { rows.count }
    var sealedRowCount: Int { rows.sealed.count }

    func timing(_ text: Text) -> EntryTiming<Key> {
        .init(id: text.id, start: text.start, end: text.end, writtenLater: text.writtenLater)
    }
    func display(_ text: Text, anchor: Anchor, time: String) -> Shown {
        .init(id: anchor.id, time: time, speaker: text.id.speaker, words: text.words)
    }
    func text(_ key: Key) -> Text? { reads.text.append(key); return texts[key] }
    func anchor(_ key: Key) -> Anchor? { anchors[key] }
    func entry(_ key: Key) -> Shown? { entries[key] }
    func location(_ key: Key) -> Location? { locations[key] }
    func row(_ index: Int) -> LayoutRow<Shown, String> { rows[index] }
    mutating func setText(_ key: Key, _ value: Text) { texts[key] = value }
    mutating func setAnchor(_ key: Key, _ value: Anchor) { anchors[key] = value }
    mutating func setEntry(_ key: Key, _ value: Shown) { entries[key] = value }
    mutating func setLocation(_ key: Key, _ value: Location) {
        locations[key] = value
        if final.contains(key) { finalLocations.insert(key) }
    }
    mutating func remove(_ key: Key) {
        texts[key] = nil; anchors[key] = nil; entries[key] = nil; locations[key] = nil
    }
    mutating func seal(_ key: Key) { final.insert(key) }
    mutating func sealLocation(_ key: Key) { finalLocations.insert(key) }
    mutating func clearLocations(keepingSealed: Bool) {
        locations = keepingSealed ? locations.filter { finalLocations.contains($0.key) } : [:]
        if !keepingSealed { finalLocations = [] }
    }
    mutating func setRow(_ index: Int, _ row: LayoutRow<Shown, String>) { rows[index] = row }
    mutating func appendRow(_ row: LayoutRow<Shown, String>) { rows.append(row) }
    mutating func replaceRows(keepingSealed: Bool, tail: [LayoutRow<Shown, String>]) {
        rows = .init(sealed: keepingSealed ? rows.sealed : [], tail: tail)
    }
    mutating func sealRows(upTo count: Int) { rows.seal(upTo: count) }
}

func makeLayout() -> TranscriptLayout {
    .init(lineTime: TranscriptLayoutFormatting.lineTime, span: TranscriptLayoutFormatting.span)
}

func makeStorage(_ texts: [Text] = [], final: Int = 0, gaps: [GapMarker<String>] = []) -> MemoryStorage {
    var state = MemoryStorage()
    state.gaps = gaps
    let layout = makeLayout()
    layout.prepare(&state)
    layout.update(&state, entries: texts, replacing: true, newlyFinal: final)
    state.reads.text = []
    return state
}
