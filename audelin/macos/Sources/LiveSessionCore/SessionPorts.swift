import CallDomain
import Foundation

/// One side of the call as it is captured (ADR-001 decision 10).
public protocol AudioCapture: Sendable {
    /// Starts delivering audio. `onAudio` is called in order, off the
    /// real-time thread, one call at a time.
    func start(onAudio: @escaping @Sendable (CapturedAudio) -> Void)
    /// No `onAudio` call starts after this returns.
    func stop()
}

/// Samples as captured, stamped on the host's clock.
public struct CapturedAudio: Sendable, Equatable {
    /// The host uptime of the first sample, as `SessionClock.uptime` reads.
    public let uptime: TimeInterval
    public let sampleRate: Double
    public let samples: [Float]

    public init(uptime: TimeInterval, sampleRate: Double, samples: [Float]) {
        self.uptime = uptime
        self.sampleRate = sampleRate
        self.samples = samples
    }
}

/// The time of day for a call's start, and the host's uptime that both
/// tracks share as the session clock.
public protocol SessionClock: Sendable {
    var now: Date { get }
    var uptime: TimeInterval { get }
}

/// Makes a call's folder with its details, before any audio is written.
public protocol NewCalls: Sendable {
    func create(title: String, details: CallDetails) throws(CallFileError)
}

/// The writer and reader of one call's recording.
public protocol RecordingFiles: Sendable {
    func writer(for call: CallID) -> any RecordingWriter
    func reader(for call: CallID) -> any RecordedAudioReader
}

/// Recognises a call's audio as it is written. The session never waits for
/// it: it may wait for the model, stall, or go on as catch-up after Stop.
public protocol LiveRecognition: Sendable {
    /// `written` reports each piece of audio once it is readable, and ends
    /// when the recording stops.
    func recognize(_ call: CallID, written: AsyncStream<WrittenAudio>) async
}

/// Audio of `track` up to `end` on the session clock is written and readable.
public struct WrittenAudio: Sendable, Equatable {
    public let track: Track
    public let epoch: Int
    public let end: TimeInterval

    public init(track: Track, epoch: Int, end: TimeInterval) {
        self.track = track
        self.epoch = epoch
        self.end = end
    }
}
