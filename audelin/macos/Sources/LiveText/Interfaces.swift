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

/// What Live text needs from a speech recogniser, whatever the model. Only
/// the recogniser makes words final, and it makes each word final within a
/// bounded stretch of audio after it.
public protocol Recognizer: Sendable {

    /// Hears one more chunk and reports what it has heard so far.
    func hear(_ chunk: AudioChunk) async throws -> Hearing

    /// Hears the rest and reports its last words, all of them final.
    func finish() async throws -> Hearing
}

/// What a recogniser has heard so far.
public struct Hearing: Equatable, Sendable {

    /// Words from some time in the track on, in order. Words before it are
    /// as last reported.
    public var words: [Word]
    /// Where in the track the report starts, at or before its first word:
    /// words heard from there before and not reported now are gone. Nil
    /// when it starts at the first word.
    public var from: Double?
    /// Words ending by this time in the track are final; nil when none is
    /// final yet.
    public var finalThrough: Double?
    /// No word not yet reported will start before this time in the track, so
    /// the track is known to be quiet up to it. Nil when the recogniser cannot say.
    public var noWordBefore: Double?

    public init(words: [Word], from: Double? = nil, finalThrough: Double? = nil, noWordBefore: Double? = nil) {

        self.words = words
        self.from = from
        self.finalThrough = finalThrough
        self.noWordBefore = noWordBefore
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
