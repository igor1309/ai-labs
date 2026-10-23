import Foundation
import Synchronization
import Testing
@testable import SystemAudioCapture

struct Refusal: Error, Equatable {}

// Callback counters and wait signals are protected by the condition lock.
final class FakeCaptureBinding: CaptureBinding, @unchecked Sendable {

    struct State {

        var events: [String] = []
        var taps: [TapRequest] = []
        var devices: [DeviceRequest] = []
        var selection: TapRequest?
        var rate = 48_000.0
        var refuse: String?
        var running = false
        var notifyOnStop = false
        var receive: (@Sendable ([Float]) -> Void)?
        var stopped: (@Sendable () -> Void)?
    }

    let state = Mutex(State())
    private let callbacks = NSCondition()
    private var inFlight = 0
    private var removing = false
    private var cleaned = false
    private let callbackKey = UUID().uuidString
    private let listenerKey = UUID().uuidString

    func waitForRemoval() {

        callbacks.lock()
        defer { callbacks.unlock() }
        while !removing { callbacks.wait() }
    }

    func waitForCleanup() {

        callbacks.lock()
        defer { callbacks.unlock() }
        while !cleaned { callbacks.wait() }
    }

    var events: [String] { state.withLock { $0.events } }
    var taps: [TapRequest] { state.withLock { $0.taps } }
    var devices: [DeviceRequest] { state.withLock { $0.devices } }

    func refuse(_ step: String?) {

        state.withLock { $0.refuse = step }
    }

    private func record(_ step: String) throws {

        try state.withLock {
            $0.events.append(step)
            if $0.refuse == step { throw Refusal() }
        }
    }

    func createTap(_ request: TapRequest) throws -> UInt32 {

        try record("tap")
        state.withLock { $0.taps.append(request); $0.selection = request }
        return 11
    }

    func updateTap(_ tap: UInt32, _ request: TapRequest) throws {

        #expect(tap == 11)
        try record("rename")
        state.withLock { $0.taps.append(request); $0.selection = request }
    }

    func destroyTap(_ tap: UInt32) {

        #expect(tap == 11)
        expectCleanupContext()
        state.withLock { $0.events.append("destroy tap") }
        callbacks.lock()
        cleaned = true
        callbacks.broadcast()
        callbacks.unlock()
    }

    func createDevice(_ request: DeviceRequest) throws -> UInt32 {

        #expect(request.tap == 11)
        try record("device")
        state.withLock { $0.devices.append(request) }
        return 22
    }

    func destroyDevice(_ device: UInt32) {

        expectCleanupContext()
        #expect(device == 22)
        state.withLock { $0.events.append("destroy device") }
    }

    func sampleRate(_ tap: UInt32) throws -> Double {

        #expect(tap == 11)
        try record("format")
        return state.withLock { $0.rate }
    }

    func installIO(_ device: UInt32, receive: @escaping @Sendable ([Float]) -> Void) throws -> UInt64 {

        #expect(device == 22)
        try record("io")
        callbacks.lock()
        removing = false
        cleaned = false
        callbacks.unlock()
        state.withLock { $0.receive = receive }
        return 33
    }

    func removeIO(_ device: UInt32, _ io: UInt64) {

        #expect(device == 22 && io == 33)
        expectCleanupContext()
        callbacks.lock()
        state.withLock { $0.events.append("remove io"); $0.receive = nil }
        removing = true
        callbacks.broadcast()
        while inFlight > 0 { callbacks.wait() }
        callbacks.unlock()
    }

    func watchDevice(_ device: UInt32, stopped: @escaping @Sendable () -> Void) throws -> UInt64 {

        #expect(device == 22)
        try record("watch")
        state.withLock { $0.stopped = stopped }
        return 44
    }

    func unwatchDevice(_ device: UInt32, _ watch: UInt64) {

        expectCleanupContext()
        #expect(device == 22 && watch == 44)
        state.withLock { $0.events.append("unwatch"); $0.stopped = nil }
    }

    func startDevice(_ device: UInt32, _ io: UInt64) throws {

        #expect(device == 22 && io == 33)
        try record("start")
        state.withLock { $0.running = true }
    }

    func stopDevice(_ device: UInt32, _ io: UInt64) {

        #expect(device == 22 && io == 33)
        expectCleanupContext()
        let callback = state.withLock {
            $0.events.append("stop")
            $0.running = false
            return $0.notifyOnStop ? $0.stopped : nil
        }
        callback?()
    }

    func changeRate(to rate: Double) {

        state.withLock { $0.rate = rate }
    }

    func systemStops() {

        Thread.current.threadDictionary[listenerKey] = true
        defer { Thread.current.threadDictionary.removeObject(forKey: listenerKey) }
        let callback = state.withLock { $0.stopped }
        callback?()
    }

    private func expectCleanupContext() {

        #expect(Thread.current.threadDictionary[callbackKey] == nil)
        #expect(Thread.current.threadDictionary[listenerKey] == nil)
    }

    func play(_ pids: [Int32]) {

        beginBuffer(pids)?()
    }

    /// Enters IO now; the returned control delivers and leaves it later.
    func beginBuffer(_ pids: [Int32], beforeReturn: @escaping @Sendable () -> Void = {}) -> (@Sendable () -> Void)? {

        callbacks.lock()
        defer { callbacks.unlock() }

        let snapshot = state.withLock { ($0.running, $0.selection, $0.rate, $0.receive) }
        guard snapshot.0, let request = snapshot.1, let receive = snapshot.3 else { return nil }
        let included = pids.filter { pid in
            switch request.selection {
            case .only(let named): named.contains(pid)
            case .allExcept(let excluded): !excluded.contains(pid)
            }
        }
        let samples = (0..<Int(snapshot.2 / 100)).map { frame in
            included.reduce(Float(0)) { $0 + tone($1, frame: frame, rate: snapshot.2) }
        }
        inFlight += 1
        return { [self] in
            Thread.current.threadDictionary[callbackKey] = true
            receive(samples)
            beforeReturn()
            Thread.current.threadDictionary.removeObject(forKey: callbackKey)
            callbacks.lock()
            inFlight -= 1
            callbacks.broadcast()
            callbacks.unlock()
        }
    }
}

func tone(_ pid: Int32, frame: Int, rate: Double) -> Float {

    Float(0.25 * sin(2 * .pi * Double(pid) * 100 * Double(frame) / rate))
}

func magnitude(_ samples: [Float], frequency: Double, rate: Double) -> Double {

    guard !samples.isEmpty else { return 0 }
    var real = 0.0
    var imaginary = 0.0
    for (frame, sample) in samples.enumerated() {
        let phase = 2 * .pi * frequency * Double(frame) / rate
        real += Double(sample) * cos(phase)
        imaginary += Double(sample) * sin(phase)
    }
    return 2 * hypot(real, imaginary) / Double(samples.count)
}
