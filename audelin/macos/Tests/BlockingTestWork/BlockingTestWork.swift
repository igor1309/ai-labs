import AVFoundation
import Foundation

/// Runs the body, then awaits blocking cleanup whether or not the body threw.
/// The body's error wins over a cleanup error.
public func withCleanup<Value>(
    isolation: isolated (any Actor)? = #isolation,
    _ body: () async throws -> Value,
    cleanup: @escaping @Sendable () throws -> Void
) async throws -> Value {

    let outcome: Result<Value, any Error>
    do { outcome = .success(try await body()) } catch { outcome = .failure(error) }
    let cleaned = Result { try cleanup() }
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
    try launch { status in
        ended.continuation.yield(status)
        ended.continuation.finish()
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

/// Reads an audio file.
public func audioFile(_ url: URL) async throws -> AudioFileContents {

    do {
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
