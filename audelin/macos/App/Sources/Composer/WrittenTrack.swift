import struct FillIn.Audio
import protocol FillIn.WrittenTrack
import TrackFile

struct WrittenTrack: FillIn.WrittenTrack {

    private let track: TrackFile

    init(track: TrackFile) {

        self.track = track
    }

    func read(from: Double, through: Double) async throws -> [Audio] {

        let samples = try await track.read(from: from, to: through)
        return [Audio(start: from, samples: samples, sampleRate: TrackFile.sampleRate)]
    }
}
