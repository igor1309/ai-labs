/// Processes to hear, or processes to leave out, including future processes.
public enum ProcessSelection: Sendable, Equatable {

    case only([Int32])
    case allExcept([Int32])
}

/// Mono samples at the rate at which they were captured.
public struct AudioPiece: Sendable, Equatable {

    public let samples: [Float]
    public let sampleRate: Double

    public init(samples: [Float], sampleRate: Double) {

        self.samples = samples
        self.sampleRate = sampleRate
    }
}

/// The requested mix, kept independent of native Core Audio types.
public struct TapRequest: Sendable, Equatable {

    public let selection: ProcessSelection
    public let mono: Bool
    public let unmuted: Bool
    public let isPrivate: Bool

    public init(selection: ProcessSelection, mono: Bool, unmuted: Bool, isPrivate: Bool) {

        self.selection = selection
        self.mono = mono
        self.unmuted = unmuted
        self.isPrivate = isPrivate
    }
}

/// The aggregate has only this tap; it never includes a hardware subdevice.
public struct DeviceRequest: Sendable, Equatable {

    public let tap: UInt32
    public let isPrivate: Bool
    public let autoStart: Bool

    public init(tap: UInt32, isPrivate: Bool, autoStart: Bool) {

        self.tap = tap
        self.isPrivate = isPrivate
        self.autoStart = autoStart
    }
}

public enum CaptureError: Error, Sendable, Equatable {

    case stopped
    case deviceStopped
    case processUnavailable(Int32)
    case unsupportedFormat
}

/// Native resources and callbacks used by one capture. Buffer callbacks are
/// ordered and carry the format read with their samples; removing IO waits
/// for callbacks already in flight.
public protocol CaptureBinding: Sendable {

    func createTap(_ request: TapRequest) throws -> UInt32
    func updateTap(_ tap: UInt32, _ request: TapRequest) throws
    func destroyTap(_ tap: UInt32)
    func createDevice(_ request: DeviceRequest) throws -> UInt32
    func destroyDevice(_ device: UInt32)
    func sampleRate(_ tap: UInt32) throws -> Double
    func installIO(_ device: UInt32, receive: @escaping @Sendable (Result<AudioPiece, any Error>) -> Void) throws -> UInt64
    func removeIO(_ device: UInt32, _ io: UInt64)
    func watchDevice(_ device: UInt32, stopped: @escaping @Sendable () -> Void) throws -> UInt64
    func unwatchDevice(_ device: UInt32, _ watch: UInt64)
    func startDevice(_ device: UInt32, _ io: UInt64) throws
    func stopDevice(_ device: UInt32, _ io: UInt64)
}
