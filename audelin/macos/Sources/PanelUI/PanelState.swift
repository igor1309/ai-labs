/// Everything the live panel shows, ready to render.
///
/// Times and labels arrive formatted: the panel draws them as given.
public struct PanelState: Equatable, Sendable {

    public var recording: Recording
    public var log: Log
    public var banners: [Banner]

    public init(recording: Recording, log: Log, banners: [Banner] = []) {

        self.recording = recording
        self.log = log
        self.banners = banners
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
        /// The call is recorded while the speech models load; live text
        /// catches up from the call's start once they are in.
        case preparing(holds: [Held])
        case lines(Lines)
    }

    struct Lines: Equatable, Sendable {

        /// The log in call order: a late group sits where its minutes were.
        public var rows: [Row]
        /// Selections the reader holds, oldest first.
        public var holds: [Held]
        /// Lines that arrived below while the reader is scrolled up.
        public var newBelow: Int
        /// The log keeps the newest line in view; off while the reader is
        /// scrolled up.
        public var followsLive: Bool

        public init(
            rows: [Row],
            holds: [Held] = [],
            newBelow: Int = 0,
            followsLive: Bool = true
        ) {
            self.rows = rows
            self.holds = holds
            self.newBelow = newBelow
            self.followsLive = followsLive
        }

        /// Lines with no late group.
        public init(
            entries: [Entry],
            holds: [Held] = [],
            newBelow: Int = 0,
            followsLive: Bool = true
        ) {
            self.init(rows: entries.map(Row.entry), holds: holds, newBelow: newBelow, followsLive: followsLive)
        }

        /// Every entry, late ones included, in call order.
        public var entries: [Entry] {

            rows.flatMap { row -> [Entry] in
                switch row {
                case let .entry(entry): [entry]
                case let .late(late): late.entries
                case .gap: []
                }
            }
        }
    }

    enum Row: Equatable, Sendable {

        case entry(Entry)
        /// Minutes transcribed after live text was switched on mid-call.
        case late(Late)
        case gap(Gap)
    }

    struct Gap: Equatable, Sendable {

        public var speaker: Speaker
        public var text: String

        public init(speaker: Speaker, text: String) {

            self.speaker = speaker
            self.text = text
        }
    }

    enum Banner: Equatable, Sendable {

        case callAudio, microphone, diskFull(savedUntil: String), callSilent

        public var title: String {
            switch self {
            case .callAudio: "Нет звука звонка"
            case .microphone: "Нет микрофона"
            case .diskFull: "Диск заполнен — дорожка остановлена"
            case .callSilent: "Звонок не слышен"
            }
        }

        public var line: String {
            switch self {
            case .callAudio: "Пишется только «я». Проверьте разрешение «Звук звонка»."
            case .microphone: "Пишутся только «они». Проверьте устройство ввода и разрешение «Микрофон»."
            case let .diskFull(time): "Всё до \(time) сохранено. Освободите место, чтобы продолжить."
            case .callSilent: "5 минут тишины со стороны «они», пока вы говорите. Проверьте разрешение «Звук звонка»."
            }
        }

        public var button: String {
            switch self {
            case .diskFull: "Открыть папку"
            default: "Открыть настройки macOS"
            }
        }

        public var action: PanelEvent {
            switch self {
            case .microphone: .openSettings(.microphone)
            case .callAudio, .callSilent: .openSettings(.systemAudioRecording)
            case .diskFull: .openCallsFolder
            }
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

    /// A selection kept exactly as it was selected, whatever the text it was
    /// selected from becomes.
    struct Held: Equatable, Sendable {

        /// The entry the selection starts in.
        public var entryID: Entry.ID
        public var text: String

        public init(entryID: Entry.ID, text: String) {

            self.entryID = entryID
            self.text = text
        }
    }
}
