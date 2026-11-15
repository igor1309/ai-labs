/// One published version, including the attribution captured when it was made.
public struct CallNotes: Equatable, Sendable {
    public var text: String
    public var made: String?
    public var templateID: String
    public var templateName: String
    public init(text: String, made: String?, templateID: String = "Default", templateName: String = "Default") {
        self.text = text; self.made = made; self.templateID = templateID; self.templateName = templateName
    }
}
public struct CallNotesPair: Equatable, Sendable {
    public var previous: CallNotes?
    public var current: CallNotes
    public init(previous: CallNotes? = nil, current: CallNotes) { self.previous = previous; self.current = current }
}
public enum CallNotesVersion: Equatable, Sendable { case previous, current }

/// The selected call as the detail shows it.
public struct CallsDetail: Equatable, Sendable {
    public enum Content: Equatable, Sendable {
        /// The notes' Markdown source.
        case notes(String, made: String? = nil)
        /// Why the notes cannot be read.
        case unreadable(String)
        case preparing
        /// Preparing the summary failed; `canRetry` when Повторить итоги is offered.
        case failed(reason: String, canRetry: Bool)
        /// No summary.
        case none
    }
    public let id: String
    public let title: String
    public let date: String
    public let duration: String
    public var content: Content
    public var pair: CallNotesPair?
    public var version: CallNotesVersion
    public var template: String?
    public var progress: String?
    public var failure: String?

    public init(id: String, title: String, date: String, duration: String, content: Content,
                pair: CallNotesPair? = nil, version: CallNotesVersion = .current, template: String? = nil,
                progress: String? = nil, failure: String? = nil) {
        self.id = id; self.title = title; self.date = date; self.duration = duration; self.content = content
        self.pair = pair; self.version = version; self.template = template; self.progress = progress; self.failure = failure
    }
}

