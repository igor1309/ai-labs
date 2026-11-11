import Foundation

public struct CallsListState: Equatable, Sendable {
    public struct Row: Equatable, Identifiable, Sendable {
        /// Where the call's summary stands, drawn as an icon; `summaryStatus` says it in words.
        public enum Summary: Equatable, Sendable { case none, pending, failed }
        public var summary: Summary
        public var canRetrySummary: Bool
        public var summaryStatus: String
        /// The call has published notes, so its row offers the eye.
        public var hasNotes: Bool
        public let id: String
        public let title: String
        public let date: String
        public let displayTitle: String
        public let duration: String
        public let editable: Bool
        public var folderName: String { id + (title.isEmpty ? "" : " " + title) }

        public init(id: String, title: String, displayTitle: String, date: String, duration: String, editable: Bool,
                    summaryStatus: String = "", hasNotes: Bool = false, canRetrySummary: Bool = false, summary: Summary = .none) {
            self.summary = summary
            self.canRetrySummary = canRetrySummary
            self.summaryStatus = summaryStatus
            self.hasNotes = hasNotes
            self.id = id
            self.title = title
            self.displayTitle = displayTitle
            self.date = date
            self.duration = duration
            self.editable = editable
        }
    }

    public struct Editing: Equatable, Sendable {
        public let id: String
        public var title: String
        public init(id: String, title: String) { self.id = id; self.title = title }
    }

    public var rows: [Row]
    public var editing: Editing?
    public var deleteID: String?
    public var busy: Bool
    public var failure: String?
    /// The selected call, if any.
    public var selectedID: String?
    /// The call whose notes the preview shows, if it is shown.
    public var previewedID: String?

    public init(rows: [Row] = [], editing: Editing? = nil, deleteID: String? = nil, busy: Bool = false, failure: String? = nil,
                selectedID: String? = nil, previewedID: String? = nil) {
        self.rows = rows; self.editing = editing; self.deleteID = deleteID; self.busy = busy; self.failure = failure
        self.selectedID = selectedID; self.previewedID = previewedID
    }

    public var deleteBody: String? {
        guard let row = rows.first(where: { $0.id == deleteID }) else { return nil }
        return "«\(row.folderName)»: удалится вся папка звонка — аудио, расшифровки и саммари. Отменить нельзя."
    }
}

public enum CallsListEvent: Equatable, Sendable {
    case open(String), beginRename(String), editTitle(String), submitRename, cancelRename
    case askDelete(String), confirmDelete, cancelDelete
    case select(String), selectNext, selectPrevious, preview(String), retrySummary(String)
}
