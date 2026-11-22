/// The timing that layout reads; the entry's content remains opaque to it.
public struct EntryTiming<Key: Hashable> {
    public var id: Key
    public var start: Double
    public var end: Double
    public var writtenLater: Bool

    public init(id: Key, start: Double, end: Double, writtenLater: Bool) {
        self.id = id
        self.start = start
        self.end = end
        self.writtenLater = writtenLater
    }
}

public struct Anchor: Equatable, Sendable {
    public var id: Int
    public var start: Double

    public init(id: Int, start: Double) {
        self.id = id
        self.start = start
    }
}

public struct Location: Equatable, Sendable {
    public var row: Int
    public var lateEntry: Int?

    public init(row: Int, lateEntry: Int? = nil) {
        self.row = row
        self.lateEntry = lateEntry
    }
}

public struct GapMarker<Content> {
    public var began: Double
    public var content: Content

    public init(began: Double, content: Content) {
        self.began = began
        self.content = content
    }
}

public enum LayoutRow<Entry, Gap> {
    case entry(Entry)
    case late(span: String, entries: [Entry])
    case gap(Gap, time: String)
}

/// Access to caller-owned layout storage. Individual lookups and writes keep a
/// text revision proportional to its changeable tail rather than the whole call.
/// Content is relayed; only timing, anchors and row locations are read here.
public protocol LayoutStorage {
    associatedtype Key: Hashable
    associatedtype Text: Equatable
    associatedtype Entry
    associatedtype Gap

    var prepared: Bool { get set }
    var ordered: [Key] { get set }
    var inSealedRows: Int { get set }
    var nextDisplayID: Int { get set }
    var revision: Int { get set }
    var textValues: [Text] { get }
    var tailKeys: [Key] { get }
    var tailLocations: [Location] { get }
    var rowCount: Int { get }
    var sealedRowCount: Int { get }
    var gaps: [GapMarker<Gap>] { get }

    func timing(_ text: Text) -> EntryTiming<Key>
    func display(_ text: Text, anchor: Anchor, time: String) -> Entry
    func text(_ key: Key) -> Text?
    func anchor(_ key: Key) -> Anchor?
    func entry(_ key: Key) -> Entry?
    func location(_ key: Key) -> Location?
    func row(_ index: Int) -> LayoutRow<Entry, Gap>

    mutating func setText(_ key: Key, _ value: Text)
    mutating func setAnchor(_ key: Key, _ value: Anchor)
    mutating func setEntry(_ key: Key, _ value: Entry)
    mutating func setLocation(_ key: Key, _ value: Location)
    mutating func remove(_ key: Key)
    mutating func seal(_ key: Key)
    mutating func sealLocation(_ key: Key)
    mutating func clearLocations(keepingSealed: Bool)
    mutating func setRow(_ index: Int, _ row: LayoutRow<Entry, Gap>)
    mutating func appendRow(_ row: LayoutRow<Entry, Gap>)
    mutating func replaceRows(keepingSealed: Bool, tail: [LayoutRow<Entry, Gap>])
    mutating func sealRows(upTo count: Int)
}

extension LayoutRow: Equatable where Entry: Equatable, Gap: Equatable {}
