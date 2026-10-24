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

/// The live filter supplies the continuous prefix. A bounded replay supplies a
/// provisional tail, replaced by the live filter when the next input arrives.
final class CompleteConversion: TrackFileConversion {

    private let inputRate: Double
    private let live: Converter
    private var history: [Float] = []
    private var historyStart: Int64 = 0
    private var inputFrames: Int64 = 0
    private var stableFrames: Int64 = 0
    private var provisionalFrames = 0

    init(inputRate: Double) throws {

        self.inputRate = inputRate
        live = try Converter(from: inputRate, to: TrackFile.sampleRate)
    }

    func convert(_ samples: [Float]) throws -> ConvertedAudio {

        history += samples
        inputFrames += Int64(samples.count)
        var output = try live.convertAvailable(samples)
        stableFrames += Int64(output.count)
        let end = Int64((Double(inputFrames) * TrackFile.sampleRate / inputRate).rounded())
        let missing = max(0, Int(end - stableFrames))
        if missing > 0 {
            let preview = try Converter(from: inputRate, to: TrackFile.sampleRate)
            var tail = try preview.convertAvailable(history)
            tail += try preview.flush()
            let origin = Double(historyStart) * TrackFile.sampleRate / inputRate
            for frame in stableFrames..<end {
                let position = Double(frame) - origin
                let first = max(0, min(tail.count - 1, Int(position)))
                let next = min(tail.count - 1, first + 1)
                let fraction = Float(position - floor(position))
                output.append(tail[first] + fraction * (tail[next] - tail[first]))
            }
        }
        let result = ConvertedAudio(samples: output, replacing: provisionalFrames)
        provisionalFrames = missing
        trimHistory()
        return result
    }

    private func trimHistory() {

        // Whole seconds align both grids at device rates. Fractional rates use
        // interpolation only in the provisional tail; the live prefix is untouched.
        let second = max(1, Int(inputRate.rounded(.up)))
        if history.count > second * 2 {
            let drop = (history.count / second - 1) * second
            history.removeFirst(drop)
            historyStart += Int64(drop)
        }
    }
}
