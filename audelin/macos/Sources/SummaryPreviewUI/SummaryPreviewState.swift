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

    public enum Version: Equatable, Sendable { case previous, current }
    public struct Menu: Equatable, Sendable {
        public struct Template: Equatable, Sendable {
            public var id: String
            public var name: String
            public var reason: String?
            public var enabled: Bool
            public init(id: String, name: String, enabled: Bool, reason: String? = nil) { self.id = id; self.name = name; self.enabled = enabled; self.reason = reason }
        }
        public var catalogueRevision: Int
        public var section: String
        public var templates: [Template]
        public var keeping: Bool?
        public var saving: Bool
        public var failure: String?
        public var filesReason: String?
        public var offersFolder: Bool
        public var openingFolder: Bool
        public var folderFailure: String?
        /// The menu button opens the menu; false when every item in it is disabled.
        public var opens: Bool
        public init(section: String, templates: [Template], keeping: Bool?, saving: Bool = false, failure: String? = nil, catalogueRevision: Int = 0,
                    filesReason: String? = nil, offersFolder: Bool = false, openingFolder: Bool = false, folderFailure: String? = nil, opens: Bool = true) {
            self.opens = opens
            self.filesReason = filesReason; self.offersFolder = offersFolder; self.openingFolder = openingFolder; self.folderFailure = folderFailure
            self.catalogueRevision = catalogueRevision; self.section = section; self.templates = templates; self.keeping = keeping; self.saving = saving; self.failure = failure
        }
    }
    public var menu: Menu?
    public var version: Version?
    public var templateName: String?
    public var progress: String?
    public var failure: String?
    public var title: String
    public var date: String
    public var duration: String
    public var notes: Notes
    /// The call's summary failed, so its menu offers Повторить итоги.
    public var canRetry: Bool
    /// The header's tags line.
    public var tags: Tags

    public init(title: String, date: String, duration: String, notes: Notes, canRetry: Bool = false, tags: Tags = .shown([]), menu: Menu? = nil,
                version: Version? = nil, templateName: String? = nil, progress: String? = nil, failure: String? = nil) {
        self.title = title; self.date = date; self.duration = duration; self.notes = notes; self.canRetry = canRetry
        self.tags = tags
        self.menu = menu; self.version = version; self.templateName = templateName; self.progress = progress; self.failure = failure
    }

    /// The tags line under the header: the call's tags with «Изменить», or the field editing them.
    public enum Tags: Equatable, Sendable {
        /// The call's tags, as first written; none shows «нет · Добавить».
        case shown([String])
        case editing(TagsField)
    }

    /// The tags field: one chip per tag, then the tag being typed.
    public struct TagsField: Equatable, Sendable {
        public var tags: [String]
        /// The tag being typed.
        public var entry: String
        /// The rest of a tag in use that the entry starts, shown after it and taken with Tab.
        public var completion: String
        /// A save is under way.
        public var saving: Bool
        /// Why the last save failed; the tags stay for a retry.
        public var failure: String?

        public init(tags: [String], entry: String = "", completion: String = "", saving: Bool = false, failure: String? = nil) {
            self.tags = tags; self.entry = entry; self.completion = completion; self.saving = saving; self.failure = failure
        }
    }
}

/// What the user asks of the call shown.
public enum SummaryPreviewEvent: Equatable, Sendable {
    /// Copy the notes' Markdown source.
    case openNotesMenu, chooseTemplate(String), toggleKeeping, openTemplatesFolder, chooseVersion(SummaryPreviewState.Version)
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
    /// Turn the tags line into the field.
    case editTags
    /// The entry's text as typed.
    case typeTag(String)
    /// Take the completion into the entry.
    case completeTag
    /// Remove one chip from the field.
    case removeTag(String)
    /// Return: the entry becomes a chip and the tags are saved.
    case submitTags
    /// Esc: the field closes with the tags unchanged.
    case cancelTags
}
