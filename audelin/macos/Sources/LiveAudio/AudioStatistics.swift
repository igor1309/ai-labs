/// Measurements for one received piece, on the live audio timeline.
public struct AudioStatistics: Sendable, Equatable {

    public let start: Double
    public let end: Double
    public let hasFiniteNonzeroSample: Bool
    public let windows: [RMSWindow]

    public init(start: Double, end: Double, hasFiniteNonzeroSample: Bool, windows: [RMSWindow]) {

        self.start = start
        self.end = end
        self.hasFiniteNonzeroSample = hasFiniteNonzeroSample
        self.windows = windows
    }

    /// A complete 20 ms window. Nonfinite samples produce a nonfinite RMS.
    public struct RMSWindow: Sendable, Equatable {

        public let start: Double
        public let end: Double
        public let rms: Double

        public init(start: Double, end: Double, rms: Double) {

            self.start = start
            self.end = end
            self.rms = rms
        }
    }
}

struct AudioStatisticsAccumulator {

    private var rate: Double?
    private var origin = 0.0
    private var sampleCount = 0
    private var windowIndex = 0
    private var sumSquares = 0.0

    mutating func measure(_ audio: Audio) -> AudioStatistics {

        if rate != audio.sampleRate {
            rate = audio.sampleRate
            origin = audio.start
            sampleCount = 0
            windowIndex = 0
            sumSquares = 0
        }
        let windowSamples = audio.sampleRate / 50
        var windows: [AudioStatistics.RMSWindow] = []
        var nonzero = false
        for sample in audio.samples {
            nonzero = nonzero || (sample.isFinite && sample != 0)
            let square = Double(sample) * Double(sample)
            var cursor = Double(sampleCount)
            sampleCount += 1
            let sampleEnd = Double(sampleCount)
            // Sample-space boundaries avoid accumulating time error across pieces.
            // A sample straddling a window boundary contributes by duration to both.
            while cursor < sampleEnd {
                let boundary = Double(windowIndex + 1) * windowSamples
                let end = min(sampleEnd, boundary)
                sumSquares += square * (end - cursor)
                cursor = end
                if cursor == boundary {
                    windows.append(.init(
                        start: origin + Double(windowIndex) / 50,
                        end: origin + Double(windowIndex + 1) / 50,
                        rms: (sumSquares / windowSamples).squareRoot()
                    ))
                    windowIndex += 1
                    sumSquares = 0
                }
            }
        }
        return AudioStatistics(
            start: audio.start, end: audio.end,
            hasFiniteNonzeroSample: nonzero, windows: windows
        )
    }
}
