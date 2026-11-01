import CoreAudio
import Darwin
import Foundation
import Synchronization
import Testing
@testable import SystemAudioCapture

/// A long call in compressed time: the real capture and Core Audio binding
/// over faked native calls, fed a call's worth of 512-frame IO buffers from a
/// thread with an audio thread's stack, then stopped as a call end stops it.
/// Ten minutes of audio by default; AUDELIN_ENDURANCE_MINUTES sets a longer
/// call, such as 180.
@Suite(.timeLimit(.minutes(60)))
struct SystemAudioEnduranceTests {

    static let minutes = ProcessInfo.processInfo.environment["AUDELIN_ENDURANCE_MINUTES"].flatMap(Double.init) ?? 10

    @Test func aLongCallDeliversEverySampleAndStops() async throws {

        let rate = 48_000.0
        let frames = 512
        let buffers = Int(Self.minutes * 60 * rate) / frames
        let calls = RecordingCaptureCalls(format: .float32MonoLittleEndian)
        let capture = try await SystemAudioCapture(binding: CoreAudioBinding(native: calls.native), processes: .only([10]))
        let received = Received()
        let consumer = Task {
            for try await piece in capture.audio { received.add(piece.samples) }
        }

        let started = ContinuousClock.now
        let batch = 1_000
        let checkpoint = max(batch, Int(60 * rate) / frames)
        var sent = 0
        while sent < buffers {
            let count = min(batch, buffers - sent)
            let first = sent
            let failed = await onAudioThread {
                for index in first..<first + count where (try? calls.deliver(samples: indexed(index * frames, frames))) == nil {
                    return true
                }
                return false
            }
            try #require(!failed, "the IO block was not installed")
            sent += count
            let expected = sent * frames
            try await waitUntil("the reader receives \(expected) samples") { received.value >= expected }
            if sent % checkpoint < batch {
                log("\(minutesText(sent, frames, rate)): \(sent) buffers, footprint \(footprintMiB()) MiB")
            }
        }
        log("delivered \(buffers) buffers (\(minutesText(buffers, frames, rate)) of audio) in \(ContinuousClock.now - started)")

        capture.stop()
        try await consumer.value
        log("stopped; received \(received.value) samples, footprint \(footprintMiB()) MiB")
        #expect(received.value == buffers * frames)
        #expect(received.broken == 0, "\(received.broken) pieces did not follow the one before")
    }

    /// The microphone's crash was its delivery growing a level deeper with
    /// every buffer, so a buffer late in the call reaches the capture as deep
    /// in the IO thread's stack as the first did.
    @Test func aLateBufferReachesTheCaptureNoDeeperThanTheFirst() async throws {

        let frames = 512
        let buffers = 200
        let calls = RecordingCaptureCalls(format: .float32MonoLittleEndian)
        let depths = Depths()
        let binding = MeasuredBinding(CoreAudioBinding(native: calls.native), receiving: depths.record)
        let capture = try await SystemAudioCapture(binding: binding, processes: .only([10]))
        let received = Received()
        let consumer = Task {
            for try await piece in capture.audio { received.add(piece.samples) }
        }

        let failed = await onAudioThread {
            for index in 0..<buffers where (try? calls.deliver(samples: indexed(index * frames, frames))) == nil { return true }
            return false
        }
        try #require(!failed, "the IO block was not installed")
        try await waitUntil("the reader receives \(buffers * frames) samples") { received.value >= buffers * frames }
        capture.stop()
        try await consumer.value

        // Past the first few buffers, which may take paths a warm capture
        // does not; 256 bytes allows a late branch, far below the 90 bytes a
        // buffer the microphone's delivery grew by before its fix.
        let all = depths.all
        try #require(all.count == buffers)
        let warm = all[10..<20].max()!
        let late = all.suffix(10).max()!
        #expect(late <= warm + 256, "buffers 10 to 20 arrived \(warm) bytes deep, the last \(late)")
        #expect(received.broken == 0, "\(received.broken) pieces did not follow the one before")
    }

    /// A day of calls starts and stops call audio many times; once a call is
    /// stopped and its reader is done, its capture is gone.
    @Test func callsStartedAndStoppedLeaveNothingBehind() async throws {

        var left: [Weak] = []
        for _ in 0..<20 {
            left.append(try await oneShortCall())
        }
        let deadline = ContinuousClock.now + .seconds(10)
        while left.contains(where: { $0.capture != nil }), ContinuousClock.now < deadline {
            try await Task.sleep(for: .milliseconds(20))
        }
        #expect(left.filter { $0.capture != nil }.count == 0, "captures still alive after their calls")
    }

    private struct Weak {
        weak var capture: SystemAudioCapture?
    }

    private func oneShortCall() async throws -> Weak {

        let frames = 512
        let buffers = 50
        let calls = RecordingCaptureCalls(format: .float32MonoLittleEndian)
        var capture: SystemAudioCapture? = try await SystemAudioCapture(binding: CoreAudioBinding(native: calls.native), processes: .only([10]))
        let audio = capture!.audio
        let received = Received()
        let consumer = Task {
            for try await piece in audio { received.add(piece.samples) }
        }
        let failed = await onAudioThread {
            for index in 0..<buffers where (try? calls.deliver(samples: indexed(index * frames, frames))) == nil { return true }
            return false
        }
        try #require(!failed, "the IO block was not installed")
        try await waitUntil("the reader receives \(buffers * frames) samples") { received.value >= buffers * frames }
        capture!.stop()
        try await consumer.value
        #expect(received.broken == 0)
        let weak = Weak(capture: capture)
        capture = nil
        return weak
    }
}

/// How deep in its thread's stack each buffer reached the capture.
private final class Depths: Sendable {

    private let depths = Mutex<[Int]>([])

    var all: [Int] { depths.withLock { $0 } }

    @inline(never)
    func record() {

        let top = UInt(bitPattern: pthread_get_stackaddr_np(pthread_self()))
        var here = 0
        let depth = withUnsafeMutablePointer(to: &here) { Int(top - UInt(bitPattern: $0)) }
        depths.withLock { $0.append(depth) }
    }
}

/// The Core Audio binding, noting each buffer as it reaches the capture.
private struct MeasuredBinding: CaptureBinding {

    let binding: CoreAudioBinding
    let receiving: @Sendable () -> Void

    init(_ binding: CoreAudioBinding, receiving: @escaping @Sendable () -> Void) {

        self.binding = binding
        self.receiving = receiving
    }

    func installIO(_ device: UInt32, receive: @escaping @Sendable (Result<AudioPiece, any Error>) -> Void) throws -> UInt64 {

        let receiving = receiving
        return try binding.installIO(device) { receiving(); receive($0) }
    }

    func createTap(_ request: TapRequest) throws -> UInt32 { try binding.createTap(request) }
    func updateTap(_ tap: UInt32, _ request: TapRequest) throws { try binding.updateTap(tap, request) }
    func destroyTap(_ tap: UInt32) { binding.destroyTap(tap) }
    func createDevice(_ request: DeviceRequest) throws -> UInt32 { try binding.createDevice(request) }
    func destroyDevice(_ device: UInt32) { binding.destroyDevice(device) }
    func sampleRate(_ tap: UInt32) throws -> Double { try binding.sampleRate(tap) }
    func removeIO(_ device: UInt32, _ io: UInt64) { binding.removeIO(device, io) }
    func watchDevice(_ device: UInt32, stopped: @escaping @Sendable () -> Void) throws -> UInt64 { try binding.watchDevice(device, stopped: stopped) }
    func unwatchDevice(_ device: UInt32, _ watch: UInt64) { binding.unwatchDevice(device, watch) }
    func startDevice(_ device: UInt32, _ io: UInt64) throws { try binding.startDevice(device, io) }
    func stopDevice(_ device: UInt32, _ io: UInt64) { binding.stopDevice(device, io) }
}

/// Each sample carries its own index, wrapping where a float stops counting
/// exactly, so a lost, repeated, reordered or replaced piece shows.
private let wrap = 1 << 24

private func indexed(_ first: Int, _ frames: Int) -> [Float] {

    (first..<first + frames).map { Float($0 % wrap) }
}

/// Counts the samples the reader received and the pieces that did not
/// carry on from the one before.
private final class Received: Sendable {

    private let state = Mutex((count: 0, broken: 0))

    var value: Int { state.withLock { $0.count } }
    var broken: Int { state.withLock { $0.broken } }

    func add(_ samples: [Float]) {

        state.withLock { state in
            let first = Float(state.count % wrap), last = Float((state.count + samples.count - 1) % wrap)
            if samples.first != first || samples.last != last { state.broken += 1 }
            state.count += samples.count
        }
    }
}

/// Waits for a condition, failing with what it waited for once a slow
/// machine would long have met it, so a lost buffer fails here, not at the
/// package's time limit.
private func waitUntil(_ what: String, seconds: Double = 20, _ condition: () -> Bool) async throws {

    let deadline = ContinuousClock.now + .seconds(seconds)
    while !condition() {
        guard ContinuousClock.now < deadline else {
            Issue.record("waited \(Int(seconds)) s for \(what)")
            throw CancellationError()
        }
        await Task.yield()
    }
}

/// Core Audio's IO threads have small stacks, like the 544 KB one in the
/// microphone crash report.
private func onAudioThread(_ work: @escaping @Sendable () -> Bool) async -> Bool {

    await withCheckedContinuation { (done: CheckedContinuation<Bool, Never>) in
        let thread = Thread { done.resume(returning: work()) }
        thread.stackSize = 544 * 1024
        thread.start()
    }
}

private func minutesText(_ buffers: Int, _ frames: Int, _ rate: Double) -> String {

    String(format: "%.1f min", Double(buffers * frames) / rate / 60)
}

private func log(_ line: String) {

    FileHandle.standardError.write(Data("endurance: \(line)\n".utf8))
}

private func footprintMiB() -> Int {

    var info = task_vm_info_data_t()
    var count = mach_msg_type_number_t(MemoryLayout<task_vm_info_data_t>.size / MemoryLayout<natural_t>.size)
    let result = withUnsafeMutablePointer(to: &info) {
        $0.withMemoryRebound(to: integer_t.self, capacity: Int(count)) {
            task_info(mach_task_self_, task_flavor_t(TASK_VM_INFO), $0, &count)
        }
    }
    return result == KERN_SUCCESS ? Int(info.phys_footprint) / 1_048_576 : -1
}
