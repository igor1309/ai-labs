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
        let received = SampleCount()
        let consumer = Task {
            for try await piece in capture.audio { received.add(piece.samples.count) }
        }

        let started = ContinuousClock.now
        try await deliver(buffers, frames: frames, rate: rate, through: engine, clock: clock, received: received)
        log("delivered \(buffers) buffers (\(minutesText(buffers, frames, rate)) of audio) in \(ContinuousClock.now - started)")

        capture.stop()
        try await consumer.value
        log("stopped; received \(received.value) samples, footprint \(footprintMiB()) MiB")
        #expect(received.value == buffers * frames)
    }

    /// Delivers on its own thread, as the engine does, and lets the reader
    /// catch up between batches so the stream holds no more than a batch.
    private func deliver(
        _ buffers: Int, frames: Int, rate: Double,
        through engine: EnduranceEngine, clock: EnduranceClock, received: SampleCount
    ) async throws {

        let batch = 1_000
        let checkpoint = max(batch, Int(60 * rate) / frames)
        var sent = 0
        while sent < buffers {
            let count = min(batch, buffers - sent)
            await onAudioThread {
                let format = AVAudioFormat(standardFormatWithSampleRate: rate, channels: 1)!
                let buffer = AVAudioPCMBuffer(pcmFormat: format, frameCapacity: AVAudioFrameCount(frames))!
                buffer.frameLength = AVAudioFrameCount(frames)
                for _ in 0..<count {
                    clock.advance(by: Double(frames) / rate)
                    engine.deliver(buffer, time: AVAudioTime(sampleTime: 0, atRate: rate))
                }
            }
            sent += count
            while received.value < sent * frames { await Task.yield() }
            if sent % checkpoint < batch {
                log("\(minutesText(sent, frames, rate)): \(sent) buffers, footprint \(footprintMiB()) MiB")
            }
        }
    }
}

private final class SampleCount: Sendable {

    private let count = Mutex(0)

    var value: Int { count.withLock { $0 } }
    func add(_ samples: Int) { count.withLock { $0 += samples } }
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

private final class EnduranceBinding: MicrophoneBinding, Sendable {

    private let native: NativeMicrophoneBinding

    init(engine: EnduranceEngine, clock: EnduranceClock) {

        native = NativeMicrophoneBinding(makeEngine: { engine }, readClock: { clock.reading })
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

        try native.start(input: input, receive: receive, configurationChanged: configurationChanged)
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
