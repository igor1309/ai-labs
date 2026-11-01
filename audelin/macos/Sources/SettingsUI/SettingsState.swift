/// What the Settings window shows. Text arrives formatted; the view only lays
/// it out.
public struct SettingsState: Equatable, Sendable {

    public var recordsCalls: Bool
    public var liveText: Bool
    public var folder: Folder
    public var engines: [Engine]
    public var selectedEngine: Engine.ID?
    /// The explain hotkey, as its symbols.
    public var explainKeys: String
    /// Present only in debug builds.
    public var chunk: Chunk?
    /// Asked once after a new folder is picked.
    public var moveConfirm: MoveConfirm?

    public init(
        recordsCalls: Bool,
        liveText: Bool,
        folder: Folder,
        engines: [Engine],
        selectedEngine: Engine.ID?,
        explainKeys: String,
        chunk: Chunk? = nil,
        moveConfirm: MoveConfirm? = nil
    ) {
        self.recordsCalls = recordsCalls
        self.liveText = liveText
        self.folder = folder
        self.engines = engines
        self.selectedEngine = selectedEngine
        self.explainKeys = explainKeys
        self.chunk = chunk
        self.moveConfirm = moveConfirm
    }
}

public extension SettingsState {

    struct Folder: Equatable, Sendable {

        public var path: String
        public var status: Status

        public init(path: String, status: Status) {

            self.path = path
            self.status = status
        }

        public enum Status: Equatable, Sendable {

            /// At rest, with the calls' count and audio size.
            case idle(calls: String)
            /// Calls are moving; `done` is between 0 and 1.
            case moving(done: Double, detail: String)
            /// The path is still the old folder until every call has moved.
            case failed(moved: String, reason: String)
            /// A move cannot start while a call is recording.
            case recording
        }
    }

    struct Engine: Equatable, Identifiable, Sendable {

        public let id: String
        public var name: String
        public var note: String
        /// Where the model is: on disk, or where it came from.
        public var availability: String
        public var size: String

        public init(id: String, name: String, note: String, availability: String, size: String) {

            self.id = id
            self.name = name
            self.note = note
            self.availability = availability
            self.size = size
        }
    }

    struct Chunk: Equatable, Sendable {

        /// Seconds.
        public var options: [Int]
        public var selected: Int
        public var releaseDefault: Int

        public init(options: [Int], selected: Int, releaseDefault: Int) {

            self.options = options
            self.selected = selected
            self.releaseDefault = releaseDefault
        }
    }

    struct MoveConfirm: Equatable, Sendable {

        public var title: String
        public var body: String

        public init(title: String, body: String) {

            self.title = title
            self.body = body
        }
    }
}
