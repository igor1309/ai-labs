import Foundation

public struct CallsListState: Equatable, Sendable {
    public struct Row: Equatable, Identifiable, Sendable {
        /// Where the call's summary stands, drawn as an icon; `summaryStatus` says it in words.
        public enum Summary: Equatable, Sendable { case none, pending, failed }
        public var summary: Summary
        /// The header of the day this row opens; nil on a day's later rows.
        public struct Day: Equatable, Sendable {
            public let title: String
            public let count: String
            public init(title: String, count: String) { self.title = title; self.count = count }
        }
        public let day: Day?
        public var canRetrySummary: Bool
        /// The call has no notes, so its menu offers to make them.
        public var canMakeSummary: Bool
        public var summaryStatus: String
        /// The call has published notes.
        public var hasNotes: Bool
        /// What the call was about, one sentence from its notes; nil without one.
        public var gist: String?
        public let id: String
        public let title: String
        /// The start time, HH:mm.
        public let time: String
        public let displayTitle: String
        public let duration: String
        public let editable: Bool
        /// Where the call matches the search; nil when no search is on.
        public var match: Match?

        /// A search match: ranges are character offsets into `displayTitle` and the snippet's text.
        public struct Match: Equatable, Sendable {
            public struct Snippet: Equatable, Sendable {
                /// The transcript time of the match, or the word for notes.
                public let place: String
                /// The place is a time, drawn in the data font.
                public let placeIsTime: Bool
                public let text: String
                public let hits: [Range<Int>]
                /// How many further matches, in words; nil when there are none.
                public let more: String?
                public init(place: String, placeIsTime: Bool, text: String, hits: [Range<Int>], more: String?) {
                    self.place = place; self.placeIsTime = placeIsTime; self.text = text; self.hits = hits; self.more = more
                }
            }
            public let title: [Range<Int>]
            public let snippet: Snippet?
            public init(title: [Range<Int>], snippet: Snippet?) { self.title = title; self.snippet = snippet }
        }

        public init(id: String, title: String, displayTitle: String, day: Day?, time: String, duration: String, editable: Bool,
                    summaryStatus: String = "", hasNotes: Bool = false, gist: String? = nil, canRetrySummary: Bool = false, canMakeSummary: Bool = false, summary: Summary = .none,
                    match: Match? = nil) {
            self.match = match
            self.summary = summary
            self.canRetrySummary = canRetrySummary
            self.canMakeSummary = canMakeSummary
            self.summaryStatus = summaryStatus
            self.hasNotes = hasNotes
            self.gist = gist
            self.id = id
            self.title = title
            self.displayTitle = displayTitle
            self.day = day
            self.time = time
            self.duration = duration
            self.editable = editable
        }
    }

    public struct Editing: Equatable, Sendable {
        public let id: String
        public var title: String
        public init(id: String, title: String) { self.id = id; self.title = title }
    }

    /// The search under way; nil when the field is empty and the whole list shows.
    public struct Search: Equatable, Sendable {
        public var query: String
        /// Transcripts are still being read; more rows may join.
        public var searching: Bool
        public init(query: String, searching: Bool) { self.query = query; self.searching = searching }
    }

    public var rows: [Row]
    public var search: Search?
    /// The field's exact input, including whitespace that does not start a search.
    public var searchText: String
    public var editing: Editing?
    public var deleteID: String?
    /// What the delete sheet says about the call it would delete.
    public var deleteBody: String?
    public var busy: Bool
    public var failure: String?
    /// The selected call, if any.
    public var selectedID: String?
    /// The window is too narrow to show the call beside the list, so Return and Space open it in its own window.
    public var narrow: Bool

    public init(rows: [Row] = [], editing: Editing? = nil, deleteID: String? = nil, deleteBody: String? = nil, busy: Bool = false, failure: String? = nil,
                selectedID: String? = nil, narrow: Bool = false, search: Search? = nil, searchText: String = "") {
        self.searchText = searchText
        self.search = search
        self.rows = rows; self.editing = editing; self.deleteID = deleteID; self.deleteBody = deleteBody; self.busy = busy; self.failure = failure
        self.selectedID = selectedID; self.narrow = narrow
    }

}

public enum CallsListEvent: Equatable, Sendable {
    case open(String), beginRename(String), editTitle(String), submitRename, cancelRename
    case askDelete(String), confirmDelete, cancelDelete
    case select(String), selectNext, selectPrevious, retrySummary(String), makeSummary(String)
    /// Return or Space in a narrow window: read the call in its own window.
    case read(String)
    /// The search field's text changed; an empty text ends the search.
    case search(String)
}
