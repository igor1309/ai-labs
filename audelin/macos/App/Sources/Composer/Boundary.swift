import Foundation

/// Audio at the composition's edge, before recording or recognition owns it.
public struct CaptureBuffer: Equatable, Sendable {
    public var samples: [Float]
    public var sampleRate: Double
    public init(samples: [Float], sampleRate: Double) {
        self.samples = samples
        self.sampleRate = sampleRate
    }
}

public enum CaptureSelection: Equatable, Sendable {
    case only([Int32])
    case allExcept([Int32])
}

public struct BoundaryCancellation: Sendable {
    private let action: @Sendable () -> Void
    public init(_ action: @escaping @Sendable () -> Void) { self.action = action }
    public func cancel() { action() }
}

/// The process objects and notifications from which the composition detects calls.
/// Callbacks run on the source's threads; cancellation never waits for a callback.
public protocol CallProcessSource: Sendable {
    func processObjects() throws -> [UInt32]
    func pid(of object: UInt32) -> Int32?
    func bundleID(of object: UInt32) -> String?
    func name(of object: UInt32) -> String
    func isRunningInput(_ object: UInt32) -> Bool
    func onProcessListChange(_ changed: @escaping @Sendable () -> Void) throws -> BoundaryCancellation
    func onProcessChange(_ object: UInt32, _ changed: @escaping @Sendable () -> Void) throws -> BoundaryCancellation
}

public protocol CallAudioAccessSource: Sendable {
    var refresh: @Sendable () async -> Bool { get }
    var reserve: @Sendable () async -> Bool { get }
    var release: @Sendable () async -> Void { get }
    var states: @Sendable () async -> AsyncStream<Bool> { get }
    var invalidate: @Sendable () async -> Void { get }
}

public struct ComposerAccess: CallAudioAccessSource {
    public var refresh: @Sendable () async -> Bool
    public var reserve: @Sendable () async -> Bool
    public var release: @Sendable () async -> Void
    public var states: @Sendable () async -> AsyncStream<Bool>
    public var invalidate: @Sendable () async -> Void

    public init(refresh: @escaping @Sendable () async -> Bool, reserve: @escaping @Sendable () async -> Bool,
                release: @escaping @Sendable () async -> Void,
                states: @escaping @Sendable () async -> AsyncStream<Bool>, invalidate: @escaping @Sendable () async -> Void) {
        self.refresh = refresh; self.reserve = reserve; self.release = release
        self.states = states; self.invalidate = invalidate
    }
}

public protocol ComposerClock: Sendable {
    var now: @Sendable () -> Date { get }
    var timeZone: @Sendable () -> TimeZone { get }
    var monotonicNow: @Sendable () -> Double { get }
    var sleep: @Sendable (Duration) async throws -> Void { get }
    var after: @Sendable (Duration, @escaping @Sendable () -> Void) -> BoundaryCancellation { get }
    var ticks: @Sendable () -> AsyncStream<Void> { get }
}

public struct ComposerTime: ComposerClock {
    public var now: @Sendable () -> Date
    public var timeZone: @Sendable () -> TimeZone
    public var monotonicNow: @Sendable () -> Double
    public var sleep: @Sendable (Duration) async throws -> Void
    public var after: @Sendable (Duration, @escaping @Sendable () -> Void) -> BoundaryCancellation
    public var ticks: @Sendable () -> AsyncStream<Void>

    public init(now: @escaping @Sendable () -> Date, timeZone: @escaping @Sendable () -> TimeZone,
                monotonicNow: @escaping @Sendable () -> Double,
                sleep: @escaping @Sendable (Duration) async throws -> Void,
                after: @escaping @Sendable (Duration, @escaping @Sendable () -> Void) -> BoundaryCancellation,
                ticks: @escaping @Sendable () -> AsyncStream<Void>) {
        self.now = now; self.timeZone = timeZone; self.monotonicNow = monotonicNow
        self.sleep = sleep; self.after = after; self.ticks = ticks
    }
}

/// Profiling can consume live audio without keeping hours of raw samples on disk.
public enum CapturePersistence: Sendable { case recorded, transient }

public enum ComposerSide: Sendable { case microphone, call }

public protocol MicrophoneSource: Sendable {
    func start() async throws -> StartedCapture<CaptureBuffer>
}
public protocol CallAudioSource: Sendable {
    func start(_ selection: CaptureSelection) async throws -> StartedCapture<CaptureBuffer>
}
public protocol RecognizerSource: Sendable {
    func recognizer(for side: ComposerSide) async throws -> any SpeechRecognizer
    func missingModels() -> [String]
    func startLoading() -> Task<Void, any Error>
}
public protocol MicrophonePermission: Sendable {
    func authorized() -> Bool
    func request() async
}
public protocol FolderCapacity: Sendable {
    func available(at folder: URL) -> Int64?
}

/// Everything a caller replaces when running the same composition elsewhere.
public struct ComposerBoundary: Sendable {
    public var capturePersistence: CapturePersistence
    public var microphone: any MicrophoneSource
    public var callAudio: any CallAudioSource
    public var recognizers: any RecognizerSource
    public var processes: any CallProcessSource
    public var access: any CallAudioAccessSource
    public var microphonePermission: any MicrophonePermission
    public var capacity: any FolderCapacity
    public var time: any ComposerClock
    public var log: any LogSink
    public var intervals: ProfileIntervals

    public init(capturePersistence: CapturePersistence, microphone: any MicrophoneSource, callAudio: any CallAudioSource,
                recognizers: any RecognizerSource, processes: any CallProcessSource, access: any CallAudioAccessSource,
                microphonePermission: any MicrophonePermission, capacity: any FolderCapacity,
                time: any ComposerClock, log: any LogSink, intervals: ProfileIntervals) {
        self.capturePersistence = capturePersistence
        self.microphone = microphone; self.callAudio = callAudio; self.recognizers = recognizers
        self.processes = processes; self.access = access; self.microphonePermission = microphonePermission
        self.capacity = capacity; self.time = time; self.log = log; self.intervals = intervals
    }
}

/// One started capture and the operation that ends its stream.
public struct StartedCapture<Piece: Sendable>: Sendable {

    public let stream: AsyncThrowingStream<Piece, any Error>
    public let stop: @Sendable () async throws -> Void

    public init(stream: AsyncThrowingStream<Piece, any Error>, stop: @escaping @Sendable () async throws -> Void) {

        self.stream = stream
        self.stop = stop
    }
}

