/// What the preview panel shows: one call's header and its notes.
public struct SummaryPreviewState: Equatable, Sendable {
    public enum Notes: Equatable, Sendable {
        /// The notes' Markdown source, drawn formatted.
        case markdown(String)
        /// Why the notes cannot be shown.
        case unreadable(String)
    }

    public var title: String
    public var date: String
    public var duration: String
    public var notes: Notes

    public init(title: String, date: String, duration: String, notes: Notes) {
        self.title = title; self.date = date; self.duration = duration; self.notes = notes
    }
}
