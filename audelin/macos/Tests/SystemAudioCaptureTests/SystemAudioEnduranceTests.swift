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
        let received = SampleCount()
        let consumer = Task {
            for try await piece in capture.audio { received.add(piece.samples.count) }
        }

        let started = ContinuousClock.now
        let batch = 1_000
        let checkpoint = max(batch, Int(60 * rate) / frames)
        var sent = 0
        while sent < buffers {
            let count = min(batch, buffers - sent)
            let failed = await onAudioThread {
                let samples = [Float](repeating: 0.25, count: frames)
                for _ in 0..<count where (try? calls.deliver(samples: samples)) == nil { return true }
                return false
            }
            try #require(!failed, "the IO block was not installed")
            sent += count
            while received.value < sent * frames { await Task.yield() }
            if sent % checkpoint < batch {
                log("\(minutesText(sent, frames, rate)): \(sent) buffers, footprint \(footprintMiB()) MiB")
            }
        }
        log("delivered \(buffers) buffers (\(minutesText(buffers, frames, rate)) of audio) in \(ContinuousClock.now - started)")

        capture.stop()
        try await consumer.value
        log("stopped; received \(received.value) samples, footprint \(footprintMiB()) MiB")
        #expect(received.value == buffers * frames)
    }
}

private final class SampleCount: Sendable {

    private let count = Mutex(0)

    var value: Int { count.withLock { $0 } }
    func add(_ samples: Int) { count.withLock { $0 += samples } }
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
