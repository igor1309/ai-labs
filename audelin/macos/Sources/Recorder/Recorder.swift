import CallDomain
import Foundation
import LiveSessionCore

/// Writes one call's tracks in 30 s WAV files through the call-files port,
/// and reads them back by time.
///
/// A file is named for its track, epoch and start on the session clock in
/// microseconds, `audio/mic-e1-t000000030000000.wav`, and holds one channel
/// of 32-bit float samples. Readers count samples by the file's size, so a
/// file is readable while it is written and a cut-off sample is never read.
public final class Recorder: RecordingWriter, RecordedAudioReader, @unchecked Sendable {
    public static let fileSeconds = 30.0

    private let call: CallID
    private let files: any CallFiles
    private let lock = NSLock()
    private var tracks: [Track: TrackState] = [:]

    public init(call: CallID, files: any CallFiles) {
        self.call = call
        self.files = files
    }

    public func startEpoch(_ epoch: Int, of track: Track, at time: TimeInterval, sampleRate: Double) throws(RecordingFailure) {
        lock.lock()
        defer { lock.unlock() }
        tracks[track]?.closeFile()
        tracks[track] = TrackState(epoch: epoch, start: time, sampleRate: sampleRate)
    }

    public func write(_ samples: [Float], to track: Track) throws(RecordingFailure) {
        lock.lock()
        defer { lock.unlock() }
        guard var state = tracks[track] else { return }
        defer { tracks[track] = state }

        var rest = samples[...]
        while !rest.isEmpty {
            let time = state.time
            do throws(CallFileError) {
                if state.file == nil || state.fileSamples >= state.samplesPerFile {
                    state.closeFile()
                    state.file = try files.create(Self.path(track, state.epoch, time), in: call)
                    try state.file?.append(Wav.header(sampleRate: state.sampleRate))
                    state.fileSamples = 0
                }
                let chunk = rest.prefix(state.samplesPerFile - state.fileSamples)
                try append(chunk, to: state.file!)
                state.fileSamples += chunk.count
                state.written += chunk.count
                rest = rest.dropFirst(chunk.count)
            } catch {
                // The failed samples are lost: the clock moves past them, and
                // the next write starts a file of its own after the hole.
                state.dropFile()
                state.written += rest.count
                throw RecordingFailure(reason: error, time: time)
            }
        }
    }

    public func stop() {
        lock.lock()
        defer { lock.unlock() }
        for track in tracks.keys { tracks[track]?.closeFile() }
        tracks = [:]
    }

    public func read(_ track: Track, from start: TimeInterval, to end: TimeInterval) throws -> [RecordedAudio] {
        var pieces: [RecordedAudio] = []
        for file in try trackFiles(track) {
            let size = try files.size(of: file.path, in: call)
            // A file the disk filled before its header holds no audio.
            guard size >= Wav.headerSize else { continue }
            let rate = try Wav.sampleRate(try files.read(file.path, in: call, offset: 0, count: Wav.headerSize))
            let count = max(0, (size - Wav.headerSize) / 4)
            let first = max(0, Int(((start - file.start) * rate).rounded(.up)))
            let last = min(count, Int(((end - file.start) * rate).rounded(.down)))
            guard first < last else { continue }
            let data = try files.read(
                file.path, in: call, offset: Wav.headerSize + first * 4, count: (last - first) * 4)
            let piece = RecordedAudio(
                epoch: file.epoch, start: file.start + Double(first) / rate, sampleRate: rate,
                samples: Wav.samples(data))
            if let previous = pieces.last, previous.epoch == piece.epoch,
               abs(previous.end - piece.start) < 0.5 / rate {
                pieces[pieces.count - 1] = RecordedAudio(
                    epoch: previous.epoch, start: previous.start, sampleRate: rate,
                    samples: previous.samples + piece.samples)
            } else {
                pieces.append(piece)
            }
        }
        return pieces
    }

    // MARK: - Files

    private func append(_ samples: ArraySlice<Float>, to file: any CallFile) throws(CallFileError) {
        let before = file.size
        do throws(CallFileError) {
            try file.append(Wav.data(samples))
        } catch {
            // Never leave part of a failed write readable.
            try? file.truncate(to: before)
            throw error
        }
    }

    private static func path(_ track: Track, _ epoch: Int, _ time: TimeInterval) -> String {
        let micros = Int((time * 1_000_000).rounded())
        return "audio/\(track.rawValue)-e\(epoch)-t\(String(format: "%015d", micros)).wav"
    }

    private struct TrackFile {
        var path: String
        var epoch: Int
        var start: TimeInterval
    }

    private func trackFiles(_ track: Track) throws -> [TrackFile] {
        try files.paths(in: "audio", of: call).compactMap { path in
            let name = (path as NSString).lastPathComponent
            let parts = name.dropLast(4).split(separator: "-")
            guard name.hasSuffix(".wav"), parts.count == 3, parts[0] == track.rawValue,
                  let epoch = Int(parts[1].dropFirst()), let micros = Int(parts[2].dropFirst())
            else { return nil }
            return TrackFile(path: path, epoch: epoch, start: Double(micros) / 1_000_000)
        }
        .sorted { $0.start < $1.start }
    }
}

private struct TrackState {
    let epoch: Int
    let start: TimeInterval
    let sampleRate: Double
    /// Samples since the epoch started, written or lost.
    var written = 0
    var file: (any CallFile)?
    var fileSamples = 0

    var time: TimeInterval { start + Double(written) / sampleRate }
    var samplesPerFile: Int { Int(Recorder.fileSeconds * sampleRate) }

    /// Records the file's final length in its header.
    mutating func closeFile() {
        if let file {
            let size = file.size
            try? file.write(Wav.uint32(size - 8), at: 4)
            try? file.write(Wav.uint32(size - Wav.headerSize), at: 40)
            file.close()
        }
        file = nil
    }

    mutating func dropFile() {
        file?.close()
        file = nil
    }
}

/// A WAV file of one channel of 32-bit float samples.
enum Wav {
    static let headerSize = 44

    static func header(sampleRate: Double) -> Data {
        let rate = UInt32(sampleRate)
        var data = Data("RIFF".utf8)
        data += uint32(UInt32.max)  // patched on close
        data += Data("WAVEfmt ".utf8)
        data += uint32(16) + uint16(3) + uint16(1) + uint32(rate) + uint32(rate * 4) + uint16(4) + uint16(32)
        data += Data("data".utf8)
        data += uint32(UInt32.max)  // patched on close
        return data
    }

    static func sampleRate(_ header: Data) throws -> Double {
        guard header.count == headerSize else { throw CocoaError(.fileReadCorruptFile) }
        let bytes = [UInt8](header)
        return Double(UInt32(bytes[24]) | UInt32(bytes[25]) << 8 | UInt32(bytes[26]) << 16 | UInt32(bytes[27]) << 24)
    }

    static func data(_ samples: ArraySlice<Float>) -> Data {
        samples.withUnsafeBufferPointer { Data(buffer: $0) }
    }

    static func samples(_ data: Data) -> [Float] {
        data.withUnsafeBytes { Array($0.bindMemory(to: Float.self)) }
    }

    static func uint32(_ value: Int) -> Data { uint32(UInt32(clamping: value)) }

    static func uint32(_ value: UInt32) -> Data { withUnsafeBytes(of: value.littleEndian) { Data($0) } }

    static func uint16(_ value: UInt16) -> Data { withUnsafeBytes(of: value.littleEndian) { Data($0) } }
}
