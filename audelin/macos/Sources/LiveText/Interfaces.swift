/// One piece of a track's audio, mono, passed to the recogniser as it is:
/// converting it to what a model needs is the recogniser's job.
public struct AudioChunk: Equatable, Sendable {

    public var samples: [Float]
    /// Samples per second.
    public var sampleRate: Double

    public init(samples: [Float], sampleRate: Double) {

        self.samples = samples
        self.sampleRate = sampleRate
    }
}

/// Where Live text gets a track's audio.
public protocol AudioSource: Sendable {

    /// The track's audio in order; it ends when the audio does.
    func audio() -> AsyncStream<AudioChunk>
}

/// What Live text needs from a speech recogniser, whatever the model.
public protocol Recognizer: Sendable {

    /// Hears one more chunk and reports what it has heard so far.
    func hear(_ chunk: AudioChunk) async throws -> Hearing

    /// Hears the rest and reports its last words, all of them final.
    func finish() async throws -> Hearing
}

/// What a recogniser has heard so far.
public struct Hearing: Equatable, Sendable {

    /// Words from some time in the track on, in order. Words before the first
    /// one are as last reported.
    public var words: [Word]
    /// Words ending by this time in the track are final; nil when the
    /// recogniser cannot tell.
    public var finalThrough: Double?

    public init(words: [Word], finalThrough: Double? = nil) {

        self.words = words
        self.finalThrough = finalThrough
    }
}

public struct Word: Equatable, Sendable {

    public var text: String
    /// Seconds into the track.
    public var start: Double
    public var end: Double

    public init(_ text: String, start: Double, end: Double) {

        self.text = text
        self.start = start
        self.end = end
    }
}
