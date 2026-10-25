/// Mono audio supplied by a capture, without a separate clock.
public struct AudioPiece: Sendable, Equatable {

    public let samples: [Float]
    public let sampleRate: Double

    public init(samples: [Float], sampleRate: Double) {

        self.samples = samples
        self.sampleRate = sampleRate
    }
}

/// Live audio's position is the duration of all preceding captured samples.
public struct Audio: Sendable, Equatable {

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

/// Start supplies one ordered stream. Stop quiesces production, including on
/// failure; a successful stop also finishes the stream. A failed start supplies
/// no audio. Samples have a positive, finite rate.
public protocol Capture: Sendable {

    func start() async throws -> AsyncThrowingStream<AudioPiece, any Error>
    func stop() async throws
}

/// Each successful write keeps all its samples, in the order of the calls.
public protocol Track: Sendable {

    func write(_ samples: [Float], sampleRate: Double) async throws
}

public enum Failure: Error, Sendable {

    case capture(any Error)
    case track(any Error)
}
