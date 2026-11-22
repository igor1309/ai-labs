import Foundation

public struct CallsListState: Equatable, Sendable {
    public enum TranscriptOffer: Equatable, Sendable {
        case available, unavailable(String)
    }

    public struct TranscriptWait: Equatable, Sendable {
        public var message: String
        public var progress: Double?
        public init(message: String, progress: Double? = nil) { self.message = message; self.progress = progress }
    }

    public struct TranscriptBanner: Equatable, Sendable {
        public enum Style: Equatable, Sendable { case error, info }
        public var style: Style
        public var title: String
        public var message: String
        public var retryID: String?
        public init(style: Style, title: String, message: String, retryID: String? = nil) {
            self.style = style; self.title = title; self.message = message; self.retryID = retryID
        }
    }

    public struct Row: Equatable, Identifiable, Sendable {
        public var transcriptAgain: TranscriptOffer
        /// Nil when the call has no previous transcript.
        public var restoreTranscript: TranscriptOffer?
        public var transcriptWait: TranscriptWait?
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
        /// The call's tags, drawn as `#tag` text at the end of its second line.
        public var tags: [String]

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
                    match: Match? = nil, tags: [String] = [], transcriptAgain: TranscriptOffer = .available,
                    restoreTranscript: TranscriptOffer? = nil, transcriptWait: TranscriptWait? = nil) {
            self.transcriptAgain = transcriptAgain; self.restoreTranscript = restoreTranscript; self.transcriptWait = transcriptWait
            self.match = match
            self.tags = tags
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

    /// Choosing calls to merge: a click marks a row instead of reading it.
    public struct Merge: Equatable, Sendable {
        public var marked: Set<String>
        /// The marked calls are being merged; rows take no clicks.
        public var running: Bool
        /// The far-apart warning's text while it asks again; nil otherwise.
        public var warning: String?
        public init(marked: Set<String> = [], running: Bool = false, warning: String? = nil) {
            self.marked = marked; self.running = running; self.warning = warning
        }
    }

    /// A chip of the filter strip: a tag in use, and whether it is chosen.
    public struct TagChip: Equatable, Sendable {
        public let name: String
        public let on: Bool
        public init(name: String, on: Bool) { self.name = name; self.on = on }
    }

    public var rows: [Row]
    /// The filter strip's chips, most used first; empty, and the strip hidden, when no call has tags.
    public var tagStrip: [TagChip]
    /// Merge mode; nil when a click reads a call.
    public var merge: Merge?
    public var search: Search?
    /// The field's exact input, including whitespace that does not start a search.
    public var searchText: String
    public var editing: Editing?
    public var deleteID: String?
    /// What the delete sheet says about the call it would delete.
    public var deleteBody: String?
    public var busy: Bool
    public var failure: String?
    public var transcriptBanner: TranscriptBanner?
    /// The selected call, if any.
    public var selectedID: String?
    /// The window is too narrow to show the call beside the list, so Return and Space open it in its own window.
    public var narrow: Bool

    public init(rows: [Row] = [], editing: Editing? = nil, deleteID: String? = nil, deleteBody: String? = nil, busy: Bool = false, failure: String? = nil,
                selectedID: String? = nil, narrow: Bool = false, search: Search? = nil, searchText: String = "", merge: Merge? = nil,
                tagStrip: [TagChip] = [], transcriptBanner: TranscriptBanner? = nil) {
        self.transcriptBanner = transcriptBanner
        self.merge = merge
        self.tagStrip = tagStrip
        self.searchText = searchText
        self.search = search
        self.rows = rows; self.editing = editing; self.deleteID = deleteID; self.deleteBody = deleteBody; self.busy = busy; self.failure = failure
        self.selectedID = selectedID; self.narrow = narrow
    }

}

public enum CallsListEvent: Equatable, Sendable {
    case makeTranscriptAgain(String), restorePreviousTranscript(String), cancelTranscriptAgain, retryTranscriptAgain(String)
    case open(String), beginRename(String), editTitle(String), submitRename, cancelRename
    case askDelete(String), confirmDelete, cancelDelete
    case select(String), selectNext, selectPrevious, retrySummary(String), makeSummary(String)
    /// Return or Space in a narrow window: read the call in its own window.
    case read(String)
    /// The search field's text changed; an empty text ends the search.
    case search(String)
    /// A click on a row in merge mode: mark it, or unmark a marked one.
    case toggleMark(String)
    /// The merge bar: merge the marked calls, or leave merge mode (also Escape).
    case confirmMerge, leaveMerge
    /// The far-apart warning's two choices.
    case mergeAnyway, goBackFromWarning
    /// A chip of the filter strip was clicked.
    case toggleTag(String)
}
