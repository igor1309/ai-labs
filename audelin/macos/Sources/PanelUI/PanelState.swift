/// Everything the live panel shows, ready to render.
///
/// Times and labels arrive formatted: the panel draws them as given.
public struct PanelState: Equatable, Sendable {

    public var recording: Recording
    public var log: Log

    public init(recording: Recording, log: Log) {

        self.recording = recording
        self.log = log
    }
}

public extension PanelState {

    enum Recording: Equatable, Sendable {

        case off
        /// Elapsed time as shown after «REC», e.g. "00:12:47".
        case on(elapsed: String)
    }

    enum Log: Equatable, Sendable {

        /// Nothing recorded yet; the panel invites a start.
        case empty
        /// The call is only recorded; the panel offers to switch live text on.
        ///
        /// Text from before live text was switched off mid-call stays above
        /// the offer.
        case liveTextOff(kept: Lines?)
        case lines(Lines)
    }

    struct Lines: Equatable, Sendable {

        /// Minutes transcribed after live text was switched on mid-call.
        public var late: Late?
        public var entries: [Entry]
        public var held: Held?
        /// Lines that arrived below while the panel stays on a held selection.
        public var newBelow: Int

        public init(
            late: Late? = nil,
            entries: [Entry],
            held: Held? = nil,
            newBelow: Int = 0
        ) {
            self.late = late
            self.entries = entries
            self.held = held
            self.newBelow = newBelow
        }
    }

    struct Late: Equatable, Sendable {

        /// The span the group covers, e.g. "12:30–12:33".
        public var span: String
        public var entries: [Entry]

        public init(span: String, entries: [Entry]) {

            self.span = span
            self.entries = entries
        }
    }

    struct Entry: Equatable, Identifiable, Sendable {

        public let id: Int
        public var time: String
        public var speaker: Speaker
        /// Text that will not change any more.
        public var settled: String
        /// Text still being recognised; drawn dim, with a caret after it.
        public var pending: String

        public init(
            id: Int,
            time: String,
            speaker: Speaker,
            settled: String,
            pending: String = ""
        ) {
            self.id = id
            self.time = time
            self.speaker = speaker
            self.settled = settled
            self.pending = pending
        }
    }

    enum Speaker: Equatable, Sendable {

        /// The microphone track, «я».
        case me
        /// The call's audio, «они».
        case them
    }

    /// A selection kept exactly as it was selected.
    ///
    /// The entry is marked only while its text still contains the held text;
    /// the held text itself never changes.
    struct Held: Equatable, Sendable {

        public var entryID: Entry.ID
        public var text: String

        public init(entryID: Entry.ID, text: String) {

            self.entryID = entryID
            self.text = text
        }
    }
}
