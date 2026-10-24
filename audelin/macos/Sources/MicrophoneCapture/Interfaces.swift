/// Mono samples at the input device's rate.
public struct AudioPiece: Sendable, Equatable {

    public let samples: [Float]
    public let sampleRate: Double

    public init(samples: [Float], sampleRate: Double) {

        self.samples = samples
        self.sampleRate = sampleRate
    }
}

public enum CaptureError: Error, Sendable, Equatable {

    case noInput
    case unsupportedFormat
    case gapTooLong
}

/// Time is the first sample's monotonic time, in the binding clock's seconds.
struct InputBuffer: Sendable {

    let channels: [[Float]]
    let sampleRate: Double
    let time: Double
}

/// Lifecycle calls are serialized by the capture. Buffer delivery is ordered;
/// stop removes the tap and waits for every callback already in flight, even
/// after a partial start. Notifications never require synchronous teardown.
protocol MicrophoneBinding: Sendable {

    var now: Double { get }
    func defaultInput() throws -> UInt32
    func watchDefaultInput(_ changed: @escaping @Sendable (UInt32) -> Void) throws
    func unwatchDefaultInput()
    func start(
        input: UInt32,
        receive: @escaping @Sendable (Result<InputBuffer, any Error>) -> Void,
        configurationChanged: @escaping @Sendable () -> Void
    ) throws
    func stop()
    func schedule(at deadline: Double, fire: @escaping @Sendable () -> Void) -> @Sendable () -> Void
}
