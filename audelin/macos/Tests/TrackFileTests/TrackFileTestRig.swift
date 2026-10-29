import BlockingTestWork
@preconcurrency import AVFoundation
import Foundation
import Synchronization
import Testing
@testable import TrackFile

func withTrackFolder(_ body: (URL) async throws -> Void) async throws {

    let folder = FileManager.default.temporaryDirectory.appendingPathComponent("track-test-\(UUID())", isDirectory: true)
    try await offPool { try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: false) }
    do { try await body(folder) }
    catch let error as DiskImageDetachFailure {
        // The image may still be mounted, so its containing folder must survive.
        throw error
    } catch {
        do { try await offPool { try FileManager.default.removeItem(at: folder) } }
        catch { Issue.record(error) }
        throw error
    }
    try await offPool { try FileManager.default.removeItem(at: folder) }
}

func tone(_ number: Int, rate: Int = 48_000, frames: Int? = nil) -> [Float] {

    let step = 2 * Double.pi * Double(200 + number * 100) / Double(rate)
    return (0..<(frames ?? rate)).map { Float(0.6 * sin(step * Double($0))) }
}

func expectSamples(_ actual: [Float], _ expected: [Float], sourceLocation: SourceLocation = #_sourceLocation) {

    #expect(actual.count == expected.count, sourceLocation: sourceLocation)
    let error = zip(actual, expected).map { abs($0 - $1) }.max() ?? 0
    #expect(error <= 1 / 32_768, "largest sample error: \(error)", sourceLocation: sourceLocation)
}

func externalSamples(_ url: URL) async throws -> [Float] {

    let audio = try await audioFile(url)
    #expect(audio.sampleRate == 48_000)
    #expect(audio.channelCount == 1)
    #expect(audio.bitDepth == 16)
    return audio.samples
}

func expectPlayable(_ url: URL, tones: Int) async throws {

    let samples = try await externalSamples(url)
    #expect(samples.count == tones * 48_000)
    for number in 1...tones {
        let start = (number - 1) * 48_000
        let end = min(number * 48_000, samples.count)
        guard start < end else { continue }
        let stretch = Array(samples[start..<end])
        expectSamples(stretch, tone(number))
    }
    try await expectAfinfo(url, frames: samples.count)
}

func expectAfinfo(_ url: URL, frames: Int) async throws {

    let result = try await runCommand("/usr/bin/afinfo", [url.path])
    #expect(result.status == 0, "\(result.output)")
    #expect(result.output.contains("\(frames) valid frames"), "\(result.output)")
    #expect(result.output.contains("48000 Hz"), "\(result.output)")
}

func dataChunkLength(_ url: URL) async throws -> Int64 {

    let data = try await offPool { try Data(contentsOf: url) }
    return Int64(bitPattern: data[56..<64].reduce(UInt64(0)) { ($0 << 8) | UInt64($1) })
}

struct TrackRig {

    let track: TrackFile
    let waiting: AsyncStream<Void>

    init(_ folder: URL, binding: (any TrackFileBinding)? = nil) async throws {

        let signal = AsyncStream<Void>.makeStream()
        waiting = signal.stream
        track = try await TrackFile(
            url: folder.appendingPathComponent("track.caf"),
            makeBinding: { url in try binding ?? DiskTrackBinding(url: url) },
            makeConversion: { try CompleteConversion(inputRate: $0) },
            readWaiting: { signal.continuation.yield(()) }
        )
    }
}

func withPendingRead(
    _ rig: TrackRig, from start: Double, to end: Double,
    _ body: (Task<[Float], any Error>) async throws -> Void
) async throws {

    let read = Task { try await rig.track.read(from: start, to: end) }
    try await withTaskCancellationHandler {
        do {
            var iterator = rig.waiting.makeAsyncIterator()
            guard await iterator.next() != nil else { throw CancellationError() }
            try await body(read)
        } catch {
            read.cancel()
            _ = await read.result
            throw error
        }
        read.cancel()
        _ = await read.result
    } onCancel: {
        read.cancel()
    }
}

struct BindingFailure: Error {}

final class FailingBinding: TrackFileBinding, Sendable {

    enum Point { case header, read, write }

    private let disk: DiskTrackBinding
    private let failure = Mutex<Point?>(nil)

    init(url: URL) throws { disk = try DiskTrackBinding(url: url) }

    func fail(_ point: Point?) { failure.withLock { $0 = point } }

    func initialize() throws {

        // Some header bytes reach disk before creation fails.
        if failure.withLock({ $0 == .header }) {
            try disk.initialize()
            throw BindingFailure()
        }
        try disk.initialize()
    }

    func write(_ samples: [Int16], at frame: Int64) throws {

        if failure.withLock({ $0 == .write }) { throw BindingFailure() }
        try disk.write(samples, at: frame)
    }

    func read(from frame: Int64, count: Int) throws -> [Float] {

        if failure.withLock({ $0 == .read }) { throw BindingFailure() }
        return try disk.read(from: frame, count: count)
    }

    func finalize(frames: Int64) throws {

        try disk.finalize(frames: frames)
    }

    func remove() { disk.remove() }
}
