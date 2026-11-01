/// The text available for one recording: `entries` run from position `from` in
/// the call, and the call's leading `finalCount` entries will never change again.
public struct ReadingTextUpdate: Equatable, Sendable {

    public enum Status: Equatable, Sendable {

        case off, gettingReady, listening, finished
        case failed(String)
    }

    public struct Entry: Equatable, Sendable {

        public struct ID: Hashable, Sendable {

            public let speaker: ReadingState.Speaker
            public let localID: Int

            public init(speaker: ReadingState.Speaker, localID: Int) {

                self.speaker = speaker
                self.localID = localID
            }
        }

        public let id: ID
        public let start: Double
        public let end: Double
        public let settled: String
        public let pending: String
        public let writtenLater: Bool

        public init(
            id: ID, start: Double, end: Double,
            settled: String = "", pending: String = "", writtenLater: Bool = false
        ) {

            self.id = id
            self.start = start
            self.end = end
            self.settled = settled
            self.pending = pending
            self.writtenLater = writtenLater
        }
    }

    public let status: Status
    public let entries: [Entry]
    public let from: Int
    public let finalCount: Int

    public init(status: Status, entries: [Entry], from: Int = 0, finalCount: Int = 0) {

        self.status = status
        self.entries = entries
        self.from = from
        self.finalCount = finalCount
    }
}

public enum ReadingRecording: Equatable, Sendable {

    case off
    case on(elapsed: Double)
}

public enum ReadingEvent: Equatable, Sendable {

    /// Switching live text is reflected by the update's status.
    case textUpdated(ReadingTextUpdate)
    case recordingChanged(ReadingRecording)
    case problemsChanged([ReadingProblem])
    case hold(ReadingState.Held)
    case letGo(ReadingState.Held)
    case scrolled(atBottom: Bool)
    case jumpToLive
}

/// A recording problem, stamped on the same elapsed clock as the text.
public struct ReadingProblem: Equatable, Sendable {

    public enum Kind: Hashable, Sendable {

        case callAudio, microphone, diskFull(ReadingState.Speaker), callSilent
    }

    public let kind: Kind
    public let began: Double

    public init(_ kind: Kind, began: Double) {

        self.kind = kind
        self.began = began
    }
}
