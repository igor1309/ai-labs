import AudioConversion
import Foundation

extension TrackFile {

    /// Creates a new file exclusively; an existing path is always an error.
    public init(url: URL) throws {

        try self.init(
            url: url, makeBinding: DiskTrackBinding.init,
            makeConversion: { try CompleteConversion(inputRate: $0) }
        )
    }
}

/// Each write ends its own converter. Preceding input fills the filter without
/// allowing later input to change audio that has already been acknowledged.
final class CompleteConversion: TrackFileConversion {

    private let inputRate: Double
    private var history: [Float] = []
    private var inputFrames: Int64 = 0
    private var outputFrames: Int64 = 0

    init(inputRate: Double) throws {

        self.inputRate = inputRate
    }

    func convert(_ samples: [Float], frames: Int) throws -> [Float] {

        if inputRate == TrackFile.sampleRate {
            if frames == samples.count { return samples }
            return (0..<frames).map { samples[min($0, samples.count - 1)] }
        }

        let converter = try Converter(from: inputRate, to: TrackFile.sampleRate)
        let ratio = TrackFile.sampleRate / inputRate
        let origin = Double(inputFrames - Int64(history.count)) * ratio
        let end = outputFrames + Int64(frames)
        var drained = try converter.convertAvailable(history + samples)
        drained += try converter.flush()
        let output = (outputFrames..<end).map { frame in
            let position = Double(frame) - origin
            let first = max(0, min(drained.count - 1, Int(position)))
            let next = min(drained.count - 1, first + 1)
            let fraction = Float(position - floor(position))
            return drained[first] + fraction * (drained[next] - drained[first])
        }
        // A second of input exceeds the filter's context while bounding replay.
        history = Array((history + samples).suffix(max(1, Int(inputRate.rounded(.up)))))
        inputFrames += Int64(samples.count)
        outputFrames = end
        return output
    }
}
