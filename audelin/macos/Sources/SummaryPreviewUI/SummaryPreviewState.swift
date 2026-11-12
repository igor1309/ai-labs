/// What the detail shows: one call's header, its notes and the actions on it.
public struct SummaryPreviewState: Equatable, Sendable {
    public enum Notes: Equatable, Sendable {
        /// The notes' Markdown source, drawn formatted, and when they were made, ready to show; nil while it is not known.
        case markdown(String, made: String?)
        /// Why the notes cannot be shown.
        case unreadable(String)
        /// The summary is being made, asked for or after a call.
        case making
        /// Preparing the summary failed, for the given reason.
        case failed(String)
        /// There is no summary.
        case none
    }

    public var title: String
    public var date: String
    public var duration: String
    public var notes: Notes
    /// The call's summary failed, so its menu offers Повторить итоги.
    public var canRetry: Bool

    public init(title: String, date: String, duration: String, notes: Notes, canRetry: Bool = false) {
        self.title = title; self.date = date; self.duration = duration; self.notes = notes; self.canRetry = canRetry
    }
}

/// What the user asks of the call shown.
public enum SummaryPreviewEvent: Equatable, Sendable {
    /// Copy the notes' Markdown source.
    case copy
    /// Show the call's folder in Finder.
    case open
    case rename
    case retrySummary
    /// Make a summary for a call that has none.
    case makeSummary
    /// Stop making the summary.
    case cancelSummary
    case delete
}
