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
    public let content: Content

    public init(id: String, title: String, date: String, duration: String, content: Content) {
        self.id = id; self.title = title; self.date = date; self.duration = duration; self.content = content
    }
}

