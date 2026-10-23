/// Call time accompanies every chunk, including chunks read back later.
public struct Audio: Equatable, Sendable {

    public let start: Double
    public let samples: [Float]
    public let sampleRate: Double
    public var end: Double { start + Double(samples.count) / sampleRate }

    public init(start: Double, samples: [Float], sampleRate: Double) {

        self.start = start
        self.samples = samples
        self.sampleRate = sampleRate
    }
}

/// Streams a track in order. Capture can buffer independently of its reader.
public protocol LiveAudio: Sendable {

    /// Awaits each delivery; cancellation ends the subscription, not capture.
    func listen(_ receive: @escaping @Sendable (Audio) async -> Void) async
}

public protocol WrittenTrack: Sendable {

    /// Reads the complete interval in call time, waiting for it to be written.
    /// Cancellation ends a pending read.
    func read(from: Double, through: Double) async throws -> [Audio]
}

/// One track's live text, retaining its text across switches.
public protocol TrackText: Sendable {

    /// Readies the same live text; may be called again after a switch.
    /// Operations honor cancellation and return before the next one starts.
    func prepare() async throws
    /// Hears the next audio and returns the complete text, including revisions.
    func hear(_ audio: Audio) async throws -> [Text]
    /// Returns the last text after hearing the rest of the audio.
    func finish() async throws -> [Text]
}

public struct Track: Sendable {

    let audio: any LiveAudio
    let written: any WrittenTrack
    let text: any TrackText

    public init(audio: any LiveAudio, written: any WrittenTrack, text: any TrackText) {

        self.audio = audio
        self.written = written
        self.text = text
    }
}

/// A segment supplied by live text; call text does not cut speech itself.
public struct Text: Equatable, Sendable {

    public let id: Int
    public let start: Double
    public let end: Double
    public let settled: String
    public let pending: String

    public init(id: Int, start: Double, end: Double, settled: String = "", pending: String = "") {

        self.id = id
        self.start = start
        self.end = end
        self.settled = settled
        self.pending = pending
    }
}

public struct State: Equatable, Sendable {

    public enum Status: Equatable, Sendable {

        case off
        case gettingReady
        case listening
        case failed(String)
        case finished
    }

    public enum Speaker: Equatable, Sendable {

        case mine
        case theirs
    }

    public struct Entry: Equatable, Sendable {

        public let speaker: Speaker
        public let text: Text
        /// The segment contains speech recovered after switching text on.
        public let writtenLater: Bool
    }

    public internal(set) var status: Status
    public internal(set) var entries: [Entry]
}
