import CallDomain
import Foundation

/// Writes one call's tracks as they are captured (ADR-001 decision 3).
public protocol RecordingWriter: Sendable {
    /// Starts `epoch` of `track` at `time` on the session clock; the
    /// samples written next follow on from it.
    func startEpoch(_ epoch: Int, of track: Track, at time: TimeInterval, sampleRate: Double) throws(RecordingFailure)
    func write(_ samples: [Float], to track: Track) throws(RecordingFailure)
    /// Ends the recording: every track is readable up to its last sample.
    func stop()
}

/// Reads back what a call's recording wrote, while it is still recording.
public protocol RecordedAudioReader: Sendable {
    /// The audio of `track` between `start` and `end`, one piece per run of
    /// samples with no gap: an epoch boundary or lost audio splits them.
    func read(_ track: Track, from start: TimeInterval, to end: TimeInterval) throws -> [RecordedAudio]
}

public struct RecordedAudio: Sendable, Equatable {
    public let epoch: Int
    public let start: TimeInterval
    public let sampleRate: Double
    public let samples: [Float]

    public init(epoch: Int, start: TimeInterval, sampleRate: Double, samples: [Float]) {
        self.epoch = epoch
        self.start = start
        self.sampleRate = sampleRate
        self.samples = samples
    }

    public var end: TimeInterval { start + Double(samples.count) / sampleRate }
}

/// Audio that could not be written; none of it is readable.
public struct RecordingFailure: Error, Sendable, Equatable {
    public let reason: CallFileError
    /// The session-clock time of the first sample that was not written.
    public let time: TimeInterval

    public init(reason: CallFileError, time: TimeInterval) {
        self.reason = reason
        self.time = time
    }
}

/// Files inside a call's folder, found by the call's id. Only the store
/// that implements this touches call folders (ADR-001 invariant 10).
public protocol CallFiles: Sendable {
    /// Creates `path` inside the call's folder. Never recreates the folder.
    func create(_ path: String, in call: CallID) throws(CallFileError) -> any CallFile
    /// The paths of the files in `directory` inside the call's folder.
    func paths(in directory: String, of call: CallID) throws(CallFileError) -> [String]
    func size(of path: String, in call: CallID) throws(CallFileError) -> Int
    func read(_ path: String, in call: CallID, offset: Int, count: Int) throws(CallFileError) -> Data
}

/// A file open for writing. It keeps writing to the same file when the
/// call's folder is renamed.
public protocol CallFile: AnyObject, Sendable {
    var size: Int { get }
    func append(_ data: Data) throws(CallFileError)
    func write(_ data: Data, at offset: Int) throws(CallFileError)
    func truncate(to size: Int) throws(CallFileError)
    func close()
}

public enum CallFileError: Error, Sendable, Equatable {
    case diskFull
    case folderGone
    case failed(String)
}
