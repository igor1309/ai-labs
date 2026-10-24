import AudioConversion
import Foundation

/// One mono recording. Its times are seconds from its first sample.
public actor TrackFile {

    public enum Failure: Error, Equatable {

        case writingEnded
        case invalidAudio
        case invalidRange
    }

    public nonisolated static let sampleRate: Double = 48_000
    public nonisolated let url: URL

    private let binding: any TrackFileBinding
    private let readWaiting: (@Sendable () -> Void)?
    private var converter: Converter?
    private var frames: Int64 = 0
    private var ended = false
    private var closed = false
    private var readers: [UUID: AsyncStream<Void>.Continuation] = [:]

    /// Creates a new file exclusively; an existing path is always an error.
    public init(url: URL) throws {

        try self.init(url: url, makeBinding: DiskTrackBinding.init)
    }

    init(
        url: URL,
        makeBinding: (URL) throws -> any TrackFileBinding,
        readWaiting: (@Sendable () -> Void)? = nil
    ) throws {

        let binding = try makeBinding(url)
        do { try binding.initialize() }
        catch {
            binding.remove()
            throw error
        }
        self.url = url
        self.binding = binding
        self.readWaiting = readWaiting
    }

    /// Appends mono floating point audio. A failed write ends writing permanently.
    public func write(_ samples: [Float], sampleRate: Double) throws {

        guard !ended else { throw Failure.writingEnded }
        do {
            guard sampleRate.isFinite, sampleRate > 0, samples.allSatisfy(\.isFinite) else {
                throw Failure.invalidAudio
            }
            guard !samples.isEmpty else { return }
            var output: [Float] = []
            if converter?.inputRate != sampleRate {
                output = try converter?.flush() ?? []
                converter = sampleRate == Self.sampleRate ? nil : try Converter(from: sampleRate, to: Self.sampleRate)
            }
            output += try converter?.convert(samples) ?? samples
            try append(output)
        } catch {
            converter = nil
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

    /// Finishes conversion and seals the file's data length. Reads remain available.
    public func close() throws {

        guard !closed else { return }
        closed = true
        defer {
            converter = nil
            endWriting()
        }
        if !ended, let converter { try append(converter.flush()) }
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
