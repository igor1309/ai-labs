import Dispatch
import Foundation

/// Each result contains only this write's audio, drained through its end.
protocol TrackFileConversion {

    func convert(_ samples: [Float], frames: Int) throws -> [Float]
}

/// One mono recording. Its times are seconds from its first sample.
public actor TrackFile {

    // Blocking file operations must not occupy the cooperative thread pool.
    nonisolated let queue: DispatchSerialQueue
    public nonisolated var unownedExecutor: UnownedSerialExecutor { queue.asUnownedSerialExecutor() }

    public enum Failure: Error, Equatable {

        case writingEnded
        case invalidAudio
        case invalidRange
    }

    public nonisolated static let sampleRate: Double = 48_000
    public nonisolated let url: URL

    private let binding: any TrackFileBinding
    private let makeConversion: (Double) throws -> any TrackFileConversion
    private let readWaiting: (@Sendable () -> Void)?
    private var conversion: (any TrackFileConversion)?
    private var inputRate: Double?
    private var duration: Double = 0
    private var frames: Int64 = 0
    private var ended = false
    private var closed = false
    private var readers: [UUID: AsyncStream<Void>.Continuation] = [:]

    init(
        url: URL,
        makeBinding: @escaping @Sendable (URL) throws -> any TrackFileBinding,
        makeConversion: @escaping (Double) throws -> any TrackFileConversion,
        readWaiting: (@Sendable () -> Void)? = nil
    ) async throws {

        let queue = DispatchSerialQueue(label: "audelin.TrackFile")
        // The header is written on the file's queue, not on the caller's thread.
        let binding = try await withCheckedThrowingContinuation { (done: CheckedContinuation<any TrackFileBinding, any Error>) in
            queue.async {
                done.resume(with: Result {
                    let binding = try makeBinding(url)
                    do { try binding.initialize() }
                    catch {
                        binding.remove()
                        throw error
                    }
                    return binding
                })
            }
        }
        self.queue = queue
        self.url = url
        self.binding = binding
        self.makeConversion = makeConversion
        self.readWaiting = readWaiting
    }

    // The binding closes its descriptor when released, so release it on the file's queue.
    deinit {

        let binding = binding
        queue.async { _ = binding }
    }

    /// Appends mono floating point audio. A failed write ends writing permanently.
    public func write(_ samples: [Float], sampleRate: Double) throws {

        guard !ended else { throw Failure.writingEnded }
        do {
            guard sampleRate.isFinite, sampleRate > 0, samples.allSatisfy(\.isFinite) else {
                throw Failure.invalidAudio
            }
            guard !samples.isEmpty else { return }
            let converter: any TrackFileConversion
            if inputRate == sampleRate, let conversion {
                converter = conversion
            } else {
                converter = try makeConversion(sampleRate)
                conversion = converter
                inputRate = sampleRate
            }
            // Accumulate seconds like the call clock so both round to the same frame.
            let end = duration + Double(samples.count) / sampleRate
            let endpoint = end * Self.sampleRate
            guard endpoint.isFinite, endpoint < Double(Int64.max / 2) else { throw Failure.invalidAudio }
            let count = Int64(endpoint.rounded()) - frames
            let output = try converter.convert(samples, frames: Int(count))
            try append(output)
            duration = end
        } catch {
            conversion = nil
            endWriting()
            throw error
        }
    }

    /// Waits for the full stretch, or returns its written portion when writing ends.
    /// Cancellation throws without consuming audio or affecting other readers.
    public func read(from start: Double, to end: Double) async throws -> [Float] {

        let first = try frame(at: start)
        let last = try frame(at: end)
        guard end >= start else { throw Failure.invalidRange }
        try Task.checkCancellation()
        guard last > first else { return [] }
        if last > frames && !ended {
            let id = UUID()
            let signal = AsyncStream<Void>.makeStream(bufferingPolicy: .bufferingNewest(1))
            readers[id] = signal.continuation
            defer { readers.removeValue(forKey: id)?.finish() }
            readWaiting?()
            var iterator = signal.stream.makeAsyncIterator()
            while last > frames && !ended {
                guard await iterator.next() != nil else { throw CancellationError() }
            }
        }
        try Task.checkCancellation()
        let available = max(0, min(last, frames) - first)
        guard available > 0 else { return [] }
        return try binding.read(from: first, count: Int(available))
    }

    /// Seals the file's data length. Reads remain available.
    public func close() throws {

        guard !closed else { return }
        closed = true
        defer {
            conversion = nil
            endWriting()
        }
        try binding.finalize(frames: frames)
    }

    private func frame(at time: Double) throws -> Int64 {

        let value = time * Self.sampleRate
        guard time >= 0, value.isFinite, value < Double(Int64.max / 2) else { throw Failure.invalidRange }
        return Int64(value.rounded())
    }

    private func append(_ samples: [Float]) throws {

        let pcm = samples.map { sample in
            Int16(max(-32_768, min(32_767, (Double(sample) * 32_768).rounded())))
        }
        try binding.write(pcm, at: frames)
        frames += Int64(pcm.count)
        for reader in readers.values { reader.yield(()) }
    }

    private func endWriting() {

        ended = true
        for reader in readers.values { reader.yield(()) }
    }
}
