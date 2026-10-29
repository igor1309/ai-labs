import AVFoundation
import Dispatch
import Foundation
import Synchronization

// Test fixtures read and write files and launch processes, which block; the
// cooperative pool must not run them, so tests await them on a few serial
// queues taken in turn, which bounds the threads without queueing every test
// behind one.
private let blockingQueues = (0..<4).map { DispatchQueue(label: "audelin.tests.blocking.\($0)") }
private let nextQueue = Atomic<UInt>(0)

private var blockingWork: DispatchQueue {

    blockingQueues[Int(nextQueue.wrappingAdd(1, ordering: .relaxed).oldValue % UInt(blockingQueues.count))]
}

/// Runs blocking test work outside the cooperative pool and awaits its result.
public func offPool<Value: Sendable>(_ work: @escaping @Sendable () throws -> Value) async throws -> Value {

    try await withCheckedThrowingContinuation { (done: CheckedContinuation<Value, any Error>) in
        blockingWork.async { done.resume(with: Result { try work() }) }
    }
}

/// Runs blocking test work that cannot fail outside the cooperative pool.
public func offPool<Value: Sendable>(_ work: @escaping @Sendable () -> Value) async -> Value {

    await withCheckedContinuation { (done: CheckedContinuation<Value, Never>) in
        blockingWork.async { done.resume(returning: work()) }
    }
}

/// Runs the body, then awaits blocking cleanup whether or not the body threw.
/// The body's error wins over a cleanup error.
public func withCleanup<Value>(
    isolation: isolated (any Actor)? = #isolation,
    _ body: () async throws -> Value,
    cleanup: @escaping @Sendable () throws -> Void
) async throws -> Value {

    let outcome: Result<Value, any Error>
    do { outcome = .success(try await body()) } catch { outcome = .failure(error) }
    let cleaned = await offPool { Result { try cleanup() } }
    let value = try outcome.get()
    try cleaned.get()
    return value
}

/// Runs a child to its exit and returns its status. Cancellation stops the child
/// and still returns only its real status once it has exited, so no caller reads
/// status or removes files under a live child.
public func exitStatus(of process: Process) async throws -> Int32 {

    try await exitStatus(
        launch: { exited in
            process.terminationHandler = { exited($0.terminationStatus) }
            try process.run()
        },
        stop: { if process.isRunning { process.terminate() } }
    )
}

/// The lifecycle behind `exitStatus(of:)`, with launching and stopping injected.
public func exitStatus(
    launch: @escaping @Sendable (_ exited: @escaping @Sendable (Int32) -> Void) throws -> Void,
    stop: @escaping @Sendable () -> Void
) async throws -> Int32 {

    let ended = AsyncStream<Int32>.makeStream()
    try await offPool {
        try launch { status in
            ended.continuation.yield(status)
            ended.continuation.finish()
        }
    }
    // Reaping must outlive cancellation of the caller.
    let reaped = Task.detached {
        var iterator = ended.stream.makeAsyncIterator()
        return await iterator.next() ?? -1
    }
    return await withTaskCancellationHandler { await reaped.value } onCancel: { stop() }
}

/// An audio file's format and its first channel.
public struct AudioFileContents: Sendable {

    public let sampleRate: Double
    public let channelCount: Int
    public let bitDepth: Int?
    public let samples: [Float]
}

public struct UnreadableAudio: Error {}

/// Reads an audio file outside the cooperative pool.
public func audioFile(_ url: URL) async throws -> AudioFileContents {

    try await offPool {
        let file = try AVAudioFile(forReading: url)
        var samples: [Float] = []
        if file.length > 0 {
            guard let buffer = AVAudioPCMBuffer(pcmFormat: file.processingFormat, frameCapacity: AVAudioFrameCount(file.length))
            else { throw UnreadableAudio() }
            try file.read(into: buffer)
            guard let channel = buffer.floatChannelData?[0] else { throw UnreadableAudio() }
            samples = Array(UnsafeBufferPointer(start: channel, count: Int(buffer.frameLength)))
        }
        let format = file.fileFormat
        return AudioFileContents(
            sampleRate: format.sampleRate, channelCount: Int(format.channelCount),
            bitDepth: format.settings[AVLinearPCMBitDepthKey] as? Int, samples: samples
        )
    }
}
