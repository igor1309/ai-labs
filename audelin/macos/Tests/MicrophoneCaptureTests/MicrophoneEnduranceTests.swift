import AVFAudio
import Darwin
import Foundation
import Synchronization
import Testing
@testable import MicrophoneCapture

/// A long call in compressed time: the real capture and native binding over a
/// fake engine, fed a call's worth of 1024-frame buffers from a thread with an
/// audio thread's stack, then stopped as a call end stops it. Ten minutes of
/// audio by default, past where a per-buffer leak in the delivery path
/// overflows; AUDELIN_ENDURANCE_MINUTES sets a longer call, such as 180.
@Suite(.timeLimit(.minutes(60)))
struct MicrophoneEnduranceTests {

    static let minutes = ProcessInfo.processInfo.environment["AUDELIN_ENDURANCE_MINUTES"].flatMap(Double.init) ?? 10

    @Test
    func aLongCallDeliversEverySampleAndStops() async throws {

        let rate = 48_000.0
        let frames = 1024
        let buffers = Int(Self.minutes * 60 * rate) / frames
        let engine = EnduranceEngine(rate: rate)
        let clock = EnduranceClock()
        let capture = try await MicrophoneCapture(binding: EnduranceBinding(engine: engine, clock: clock))
        let received = Received()
        let consumer = Task {
            for try await piece in capture.audio { received.add(piece.samples) }
        }

        let started = ContinuousClock.now
        try await deliver(buffers, frames: frames, rate: rate, through: engine, clock: clock, received: received)
        log("delivered \(buffers) buffers (\(minutesText(buffers, frames, rate)) of audio) in \(ContinuousClock.now - started)")

        capture.stop()
        try await consumer.value
        log("stopped; received \(received.value) samples, footprint \(footprintMiB()) MiB")
        #expect(received.value == buffers * frames)
        #expect(received.broken == 0, "\(received.broken) pieces did not follow the one before")
    }

    /// The crash was the delivery growing a level deeper with every buffer, so
    /// a buffer late in the call reaches the capture as deep in the audio
    /// thread's stack as the first did.
    @Test
    func aLateBufferReachesTheCaptureNoDeeperThanTheFirst() async throws {

        let rate = 48_000.0
        let frames = 1024
        let buffers = 200
        let engine = EnduranceEngine(rate: rate)
        let clock = EnduranceClock()
        let depths = Depths()
        let capture = try await MicrophoneCapture(binding: EnduranceBinding(engine: engine, clock: clock, receiving: depths.record))
        let received = Received()
        let consumer = Task {
            for try await piece in capture.audio { received.add(piece.samples) }
        }

        await onAudioThread {
            let buffer = indexedBuffer(rate: rate, frames: frames)
            for index in 0..<buffers {
                fill(buffer, from: index * frames)
                clock.advance(by: Double(frames) / rate)
                engine.deliver(buffer, time: AVAudioTime(sampleTime: 0, atRate: rate))
            }
        }
        capture.stop()
        try await consumer.value

        // Past the first few buffers, which may take paths a warm capture
        // does not; 256 bytes allows a late branch, far below the 90 bytes a
        // buffer the delivery grew by before the fix.
        let all = depths.all
        try #require(all.count == buffers)
        let warm = all[10..<20].max()!
        let late = all.suffix(10).max()!
        #expect(late <= warm + 256, "buffers 10 to 20 arrived \(warm) bytes deep, the last \(late)")
        #expect(received.value == buffers * frames)
        #expect(received.broken == 0, "\(received.broken) pieces did not follow the one before")
    }

    /// A day of calls starts and stops the microphone many times; once a call
    /// is stopped and its reader is done, nothing of it stays alive.
    @Test
    func callsStartedAndStoppedLeaveNothingBehind() async throws {

        var left: [Weak] = []
        for _ in 0..<20 {
            left.append(try await oneShortCall())
        }
        // A stopped capture lets go on its own queue, which a busy machine
        // may take a while to run.
        let deadline = ContinuousClock.now + .seconds(10)
        while left.contains(where: { $0.capture != nil || $0.engine != nil }), ContinuousClock.now < deadline {
            try await Task.sleep(for: .milliseconds(20))
        }
        #expect(left.filter { $0.capture != nil }.count == 0, "captures still alive after their calls")
        // The engine holds the tap, and the tap the delivery path.
        #expect(left.filter { $0.engine != nil }.count == 0, "engines still alive after their calls")
    }

    private struct Weak {
        weak var capture: MicrophoneCapture?
        weak var engine: EnduranceEngine?
    }

    private func oneShortCall() async throws -> Weak {

        let rate = 48_000.0
        let frames = 1024
        let buffers = 50
        let engine = EnduranceEngine(rate: rate)
        let clock = EnduranceClock()
        var capture: MicrophoneCapture? = try await MicrophoneCapture(binding: EnduranceBinding(engine: engine, clock: clock))
        let audio = capture!.audio
        let received = Received()
        let consumer = Task {
            for try await piece in audio { received.add(piece.samples) }
        }
        await onAudioThread {
            let buffer = indexedBuffer(rate: rate, frames: frames)
            for index in 0..<buffers {
                fill(buffer, from: index * frames)
                clock.advance(by: Double(frames) / rate)
                engine.deliver(buffer, time: AVAudioTime(sampleTime: 0, atRate: rate))
            }
        }
        try await waitUntil("the reader receives \(buffers * frames) samples") { received.value >= buffers * frames }
        capture!.stop()
        try await consumer.value
        #expect(received.broken == 0)
        let weak = Weak(capture: capture, engine: engine)
        capture = nil
        return weak
    }

    /// Delivers on its own thread, as the engine does, and lets the reader
    /// catch up between batches so the stream holds no more than a batch.
    private func deliver(
        _ buffers: Int, frames: Int, rate: Double,
        through engine: EnduranceEngine, clock: EnduranceClock, received: Received
    ) async throws {

        let batch = 1_000
        let checkpoint = max(batch, Int(60 * rate) / frames)
        var sent = 0
        while sent < buffers {
            let count = min(batch, buffers - sent)
            let first = sent
            await onAudioThread {
                let buffer = indexedBuffer(rate: rate, frames: frames)
                for index in first..<first + count {
                    fill(buffer, from: index * frames)
                    clock.advance(by: Double(frames) / rate)
                    engine.deliver(buffer, time: AVAudioTime(sampleTime: 0, atRate: rate))
                }
            }
            sent += count
            let expected = sent * frames
            try await waitUntil("the reader receives \(expected) samples") { received.value >= expected }
            if sent % checkpoint < batch {
                log("\(minutesText(sent, frames, rate)): \(sent) buffers, footprint \(footprintMiB()) MiB")
            }
        }
    }
}

/// Each sample carries its own index, wrapping where a float stops counting
/// exactly, so a lost, repeated, reordered or replaced piece shows.
private let wrap = 1 << 24

private func indexedBuffer(rate: Double, frames: Int) -> AVAudioPCMBuffer {

    let format = AVAudioFormat(standardFormatWithSampleRate: rate, channels: 1)!
    let buffer = AVAudioPCMBuffer(pcmFormat: format, frameCapacity: AVAudioFrameCount(frames))!
    buffer.frameLength = AVAudioFrameCount(frames)
    return buffer
}

private func fill(_ buffer: AVAudioPCMBuffer, from first: Int) {

    let samples = buffer.floatChannelData![0]
    for frame in 0..<Int(buffer.frameLength) {
        samples[frame] = Float((first + frame) % wrap)
    }
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

/// The crash report's audio thread had a 544 KB stack.
private func onAudioThread(_ work: @escaping @Sendable () -> Void) async {

    await withCheckedContinuation { (done: CheckedContinuation<Void, Never>) in
        let thread = Thread {
            work()
            done.resume()
        }
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

private final class EnduranceBinding: MicrophoneBinding, Sendable {

    private let native: NativeMicrophoneBinding
    private let receiving: @Sendable () -> Void

    init(engine: EnduranceEngine, clock: EnduranceClock, receiving: @escaping @Sendable () -> Void = {}) {

        native = NativeMicrophoneBinding(makeEngine: { engine }, readClock: { clock.reading })
        self.receiving = receiving
    }

    var now: Double { 0 }
    func defaultInput() throws -> UInt32 { 7 }
    func inputAvailable(_ input: UInt32) -> Bool { true }
    func watchDefaultInput(_ changed: @escaping @Sendable (UInt32) -> Void) throws {}
    func unwatchDefaultInput() {}

    func start(
        input: UInt32,
        receive: @escaping @Sendable (Result<InputBuffer, any Error>) -> Void,
        configurationChanged: @escaping @Sendable () -> Void
    ) throws {

        let receiving = receiving
        try native.start(input: input, receive: { receiving(); receive($0) }, configurationChanged: configurationChanged)
    }

    func stop() { native.stop() }

    func schedule(at deadline: Double, fire: @escaping @Sendable () -> Void) -> @Sendable () -> Void { {} }
}

/// Each buffer's first sample follows the last one's end, so nothing is padded.
private final class EnduranceClock: Sendable {

    private let time = Mutex(0.0)

    var reading: MicrophoneClockReading {

        let now = time.withLock { $0 }
        return MicrophoneClockReading(host: now, continuous: now)
    }

    func advance(by seconds: Double) {

        time.withLock { $0 += seconds }
    }
}

private final class EnduranceEngine: MicrophoneEngine, @unchecked Sendable {

    private struct Tap {
        let block: @Sendable (AVAudioPCMBuffer, AVAudioTime) -> Void
    }

    private let rate: Double
    private let tap = Mutex<Tap?>(nil)

    init(rate: Double) { self.rate = rate }

    var voiceProcessingEnabled: Bool { false }
    func disableVoiceProcessing() throws {}
    func use(device: UInt32) throws {}
    func inputFormat() -> AVAudioFormat { AVAudioFormat(standardFormatWithSampleRate: rate, channels: 1)! }
    func observeConfigurationChange(_ changed: @escaping @Sendable () -> Void) -> any NSObjectProtocol { NSObject() }

    func installTap(format: AVAudioFormat, block: @escaping @Sendable (AVAudioPCMBuffer, AVAudioTime) -> Void) {

        tap.withLock { $0 = Tap(block: block) }
    }

    func removeTap() { tap.withLock { $0 = nil } }
    func start() throws {}
    func stop() {}

    func deliver(_ buffer: AVAudioPCMBuffer, time: AVAudioTime) {

        tap.withLock { $0 }?.block(buffer, time)
    }
}
