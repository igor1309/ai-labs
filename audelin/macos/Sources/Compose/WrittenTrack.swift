import struct CallText.Audio
import protocol CallText.WrittenTrack
import TrackFile

public struct WrittenTrack: CallText.WrittenTrack {

    private let track: TrackFile

    public init(track: TrackFile) {

        self.track = track
    }

    public func read(from: Double, through: Double) async throws -> [Audio] {

        let samples = try await track.read(from: from, to: through)
        return [Audio(start: from, samples: samples, sampleRate: TrackFile.sampleRate)]
    }
}
