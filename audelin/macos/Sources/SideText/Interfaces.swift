/// Call time accompanies every delivery, including buffered audio.
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

public protocol LiveAudio: Sendable {

    /// Includes captured buffers not yet delivered to the subscriber.
    var capturedThrough: Double { get }
    /// Delivers in order, awaiting each receipt; returns when the source ends.
    /// Cancellation ends this subscription without ending capture.
    func listen(_ receive: @escaping @Sendable (Audio) async -> Void) async
}

/// The same live text is retained across switches and shared with filling in.
public protocol LiveText: Sendable {

    /// Returns the complete text, including revisions of earlier segments.
    func hear(_ audio: Audio) async throws -> [Text]
    /// Cancels the waiting hearing, retaining live text for replay on switch on.
    func cancelHearing() async
    func finish() async throws -> [Text]
    /// Releases live text, returning only once it has stopped.
    func stop() async
}

/// One filling-in run. The caller serializes it with all other live-text work.
public protocol FillingIn: Sendable {

    /// Readies live text and hears missed audio from the supplied cursor.
    /// Each receipt gives the complete text and the position consumed by it.
    /// Returns or throws only after all work on live text and receipts ends.
    func fillIn(from: Double, receive: @escaping @Sendable (FilledText) async -> Void) async throws
    /// Requests abandonment without waiting for held collaborator work.
    func abandon() async
}

public struct FilledText: Equatable, Sendable {

    public let text: [Text]
    public let heardThrough: Double
    public let sampleRate: Double

    public init(text: [Text], heardThrough: Double, sampleRate: Double) {

        self.text = text
        self.heardThrough = heardThrough
        self.sampleRate = sampleRate
    }
}

/// A segment supplied by live text; side text does not cut speech itself.
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
