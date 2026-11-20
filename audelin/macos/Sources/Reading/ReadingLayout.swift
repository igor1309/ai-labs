import SplitRows

/// The transcript portion of Reading's state. Copies share their sealed storage.
public struct ReadingLayout: Sendable {

    public enum Change: Equatable, Sendable {
        case prepare
        case text(ReadingTextUpdate)
        case rebuild
    }

    public var anchors: SplitDictionary<ReadingTextUpdate.Entry.ID, ReadingState.Anchor>
    public var nextDisplayID: Int
    public var text: SplitDictionary<ReadingTextUpdate.Entry.ID, ReadingTextUpdate.Entry>
    public var rendered: ReadingState.Rendered
    public var rows: SplitRows<ReadingState.Row>
    public var revision: Int
    public var problems: [ReadingProblem]

    public init(
        anchors: SplitDictionary<ReadingTextUpdate.Entry.ID, ReadingState.Anchor> = [:],
        nextDisplayID: Int = 0,
        text: SplitDictionary<ReadingTextUpdate.Entry.ID, ReadingTextUpdate.Entry> = [:],
        rendered: ReadingState.Rendered = .init(), rows: SplitRows<ReadingState.Row> = [],
        revision: Int = 0, problems: [ReadingProblem] = []
    ) {
        self.anchors = anchors
        self.nextDisplayID = nextDisplayID
        self.text = text
        self.rendered = rendered
        self.rows = rows
        self.revision = revision
        self.problems = problems
    }
}

extension ReadingLayout: Equatable {
    public static func == (lhs: Self, rhs: Self) -> Bool {
        lhs.anchors == rhs.anchors && lhs.nextDisplayID == rhs.nextDisplayID && lhs.text == rhs.text
            && lhs.rows == rhs.rows && lhs.revision == rhs.revision && lhs.problems == rhs.problems
            && lhs.rendered.prepared == rhs.rendered.prepared && lhs.rendered.ordered == rhs.rendered.ordered
            && lhs.rendered.inSealedRows == rhs.rendered.inSealedRows
            && lhs.rendered.entries == rhs.rendered.entries && lhs.rendered.locations == rhs.rendered.locations
    }
}
