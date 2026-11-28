import Foundation

public struct SplitChoices: Equatable, Sendable {
    public struct Choice: Equatable, Sendable {
        public let before: String
        public let after: String
        public let beforeSpeaker: String
        public let afterSpeaker: String
        public let cut: Int
        public let gap: Int
        public let suggestsTransition: Bool
        public let secondPartMinute: Date

        public init(before: String, after: String, cut: Int, gap: Int, suggestsTransition: Bool, secondPartMinute: Date,
                    beforeSpeaker: String = "", afterSpeaker: String = "") {
            self.beforeSpeaker = beforeSpeaker
            self.afterSpeaker = afterSpeaker
            self.before = before; self.after = after; self.cut = cut; self.gap = gap
            self.suggestsTransition = suggestsTransition; self.secondPartMinute = secondPartMinute
        }
    }

    public let transcriptIdentity: String
    public let choices: [Choice]

    public init(transcriptIdentity: String, choices: [Choice]) {
        self.transcriptIdentity = transcriptIdentity; self.choices = choices
    }
}

public struct SplitRequest: Equatable, Sendable {
    public let id: String
    public let transcriptIdentity: String
    public let cut: Int
    public let firstTitle: String
    public let secondTitle: String

    public init(id: String, transcriptIdentity: String, cut: Int, firstTitle: String, secondTitle: String) {
        self.id = id; self.transcriptIdentity = transcriptIdentity; self.cut = cut
        self.firstTitle = firstTitle; self.secondTitle = secondTitle
    }
}

public struct SplitReplacement: Equatable, Sendable {
    public let first: String
    public let second: String

    public init(first: String, second: String) { self.first = first; self.second = second }
}

public enum SplitRefusal: Error, Equatable, Sendable {
    case inactiveFolder
    case folderMove
    case busy
    case invalidTitle
    case journalUnavailable
    case expiredTranscript
    case invalidChoice
    case recoveryRequired(String)
    case committed(SplitReplacement, reason: String)
}

public enum SplitPortFailure: Error, Equatable, Sendable {
    case refused(SplitRefusal)
    case failed(String)
}

public protocol RecordingsSplitChoices: Sendable {
    /// An empty choices list means the saved transcript offers no boundary.
    func splitChoices(id: String) async throws -> SplitChoices
}

public protocol RecordingsSplit: Sendable {
    func split(_ request: SplitRequest) async throws -> SplitReplacement
}
