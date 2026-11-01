/// Call time accompanies audio read from the written track.
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

public protocol WrittenTrack: Sendable {

    /// Reads the complete interval in order, waiting for it to be written.
    /// Chunks may overlap the bounds; fill in trims them to the missed audio.
    func read(from: Double, through: Double) async throws -> [Audio]
}

public protocol LiveText: Sendable {

    /// Readies the same live text, retaining what it has already heard.
    func prepare() async throws
    /// Hears the next audio and returns the complete text, including revisions.
    func hear(_ audio: Audio) async throws -> [Text]
}

/// One atomic view of capture, including audio not yet delivered to a listener.
public struct Position: Equatable, Sendable {

    public let capturedThrough: Double
    public let ended: Bool

    public init(capturedThrough: Double, ended: Bool) {

        self.capturedThrough = capturedThrough
        self.ended = ended
    }
}

public protocol LiveAudioPosition: Sendable {

    /// Captured time never decreases, and cannot advance after ending.
    var position: Position { get }
}

/// A segment supplied by live text; fill in does not cut speech itself.
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
