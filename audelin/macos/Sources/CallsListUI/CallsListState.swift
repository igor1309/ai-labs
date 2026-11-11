import Foundation

public struct CallsListState: Equatable, Sendable {
    public struct Row: Equatable, Identifiable, Sendable {
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

        public init(id: String, title: String, start: Date, duration: TimeInterval?, timeZone: TimeZone, text: CallsListText, editable: Bool, summaryStatus: String = "", hasNotes: Bool = false, canRetrySummary: Bool = false) {
            self.canRetrySummary = canRetrySummary
            self.summaryStatus = summaryStatus
            self.hasNotes = hasNotes
            self.id = id
            self.title = title
            self.editable = editable
            let formatter = DateFormatter()
            formatter.locale = Locale(identifier: "en_US_POSIX")
            formatter.calendar = Calendar(identifier: .gregorian)
            formatter.timeZone = timeZone
            formatter.dateFormat = "dd.MM · HH:mm"
            date = formatter.string(from: start)
            formatter.dateFormat = "yyyy.MM.dd-HHmm"
            displayTitle = title.isEmpty ? formatter.string(from: start) : title
            if let duration, duration.isFinite, duration >= 0 {
                let minutes = Int(min(duration / 60, Double(Int.max / 60)))
                self.duration = minutes < 60 ? text(.minutes, minutes) : text(.hoursMinutes, minutes / 60, minutes % 60)
            } else {
                self.duration = "—"
            }
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

    /// The delete confirmation's sentence in the given language, while a delete is asked.
    public func deleteBody(_ text: CallsListText) -> String? {
        guard let row = rows.first(where: { $0.id == deleteID }) else { return nil }
        return text(.deleteBody, row.folderName)
    }
}

public enum CallsListEvent: Equatable, Sendable {
    case open(String), beginRename(String), editTitle(String), submitRename, cancelRename
    case askDelete(String), confirmDelete, cancelDelete
    case select(String), selectNext, selectPrevious, preview(String), retrySummary(String)
}
