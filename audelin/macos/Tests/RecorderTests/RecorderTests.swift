import CallDomain
import Foundation
import LiveSessionCore
import Recorder
import RecorderTestSupport
import Testing

/// Recorder QA scenarios (`docs/spec/recorder/QA.md`): the adapter writing
/// to temporary folders through a call-files double.
@Suite struct RecorderTests {
    @Test func s1AudioIsReadableAsWritten() throws {
        let setup = try Setup()
        let tone = Sweep.samples(from: 0, seconds: 2, tone: 440)
        try setup.recorder.startEpoch(1, of: .mic, at: 0, sampleRate: Sweep.rate)

        try setup.recorder.write(tone, to: .mic)

        let read = try setup.recorder.read(.mic, from: 0, to: 2)
        #expect(read.map(\.samples) == [tone])
    }

    @Test func s2TwoTracks() throws {
        let setup = try Setup()
        let mic = Sweep.samples(from: 0, seconds: 10, tone: 440)
        let call = Sweep.samples(from: 0, seconds: 10, tone: 1_000)
        try setup.recorder.startEpoch(1, of: .mic, at: 0, sampleRate: Sweep.rate)
        try setup.recorder.startEpoch(1, of: .call, at: 0, sampleRate: Sweep.rate)

        try setup.recorder.write(mic, to: .mic)
        try setup.recorder.write(call, to: .call)

        #expect(try setup.recorder.read(.mic, from: 0, to: 10).map(\.samples) == [mic])
        #expect(try setup.recorder.read(.call, from: 0, to: 10).map(\.samples) == [call])
    }

    @Test func s3ARangeOfALongRecording() throws {
        let setup = try Setup()
        try setup.recorder.startEpoch(1, of: .mic, at: 0, sampleRate: Sweep.rate)

        try setup.write(seconds: 0..<75)

        #expect(try setup.fileSeconds(.mic) == [30, 30, 15])
        let read = try setup.recorder.read(.mic, from: 20, to: 70)
        #expect(read.count == 1)
        #expect(read.first?.start == 20)
        #expect(read.first?.samples == Sweep.samples(from: 20, seconds: 50))
    }

    @Test func s4ACrashLosesOnlyTheLastMoments() throws {
        let setup = try Setup()
        let child = Process()
        child.executableURL = Setup.crashChild
        child.arguments = [setup.files.root.path, setup.call.description, "70"]
        let output = Pipe()
        child.standardOutput = output
        try child.run()
        let said = String(decoding: output.fileHandleForReading.availableData, as: UTF8.self)
        #expect(said.hasPrefix("wrote 70"))

        kill(child.processIdentifier, SIGKILL)
        child.waitUntilExit()
        // A write cut off mid-sample leaves stray bytes at the end.
        let last = try #require(try setup.audioFiles(.mic).last, "the child wrote no file")
        let handle = try FileHandle(forWritingTo: last)
        try handle.seekToEnd()
        try handle.write(contentsOf: Data([0x01, 0x02]))
        try handle.close()

        let read = try Recorder(call: setup.call, files: setup.files).read(.mic, from: 0, to: 75)
        let first = try #require(read.first)
        #expect(first.start == 0 && first.end >= 60)
        for piece in read {
            #expect(piece.samples == Sweep.samples(from: piece.start, seconds: piece.end - piece.start))
        }
    }

    @Test func s5TheDiskFills() throws {
        let image = try DiskImage(megabytes: 5)
        defer { image.detach() }
        let setup = try Setup(root: image.mountPoint)
        try setup.recorder.startEpoch(1, of: .mic, at: 0, sampleRate: Sweep.rate)

        var failure: RecordingFailure?
        for second in 0..<200 where failure == nil {
            do {
                try setup.recorder.write(Sweep.samples(from: Double(second), seconds: 1), to: .mic)
            } catch {
                failure = error
            }
        }

        let failed = try #require(failure, "no write failed on a full disk")
        #expect(failed.reason == .diskFull)
        let read = try setup.recorder.read(.mic, from: 0, to: 200)
        #expect(read.allSatisfy { $0.end <= failed.time })
        #expect(read.last?.end == failed.time)
    }

    @Test func s5TheDiskFillsAsAFileStarts() throws {
        let setup = try Setup()
        let full = FullAfter(setup.files, files: 1)
        let recorder = Recorder(call: setup.call, files: full)
        try recorder.startEpoch(1, of: .mic, at: 0, sampleRate: Sweep.rate)
        for second in 0..<30 {
            try recorder.write(Sweep.samples(from: Double(second), seconds: 1), to: .mic)
        }

        #expect {
            try recorder.write(Sweep.samples(from: 30, seconds: 1), to: .mic)
        } throws: { error in
            (error as? RecordingFailure) == RecordingFailure(reason: .diskFull, time: 30)
        }

        let read = try recorder.read(.mic, from: 0, to: 31)
        #expect(read.map(\.end) == [30])
    }

    @Test func s6ANewEpoch() throws {
        let setup = try Setup()
        try setup.recorder.startEpoch(1, of: .mic, at: 0, sampleRate: Sweep.rate)
        try setup.write(seconds: 0..<10)

        try setup.recorder.startEpoch(2, of: .mic, at: 15, sampleRate: Sweep.rate)
        try setup.write(seconds: 15..<25)

        #expect(try setup.fileSeconds(.mic) == [10, 10])
        let read = try setup.recorder.read(.mic, from: 0, to: 25)
        #expect(read.map(\.epoch) == [1, 2])
        #expect(read.map(\.start) == [0, 15])
        #expect(read.map(\.end) == [10, 25])
    }

    /// File names hold the start in microseconds, past 32 bits after 35 min.
    @Test func s6EpochsLateInALongCall() throws {
        let setup = try Setup()
        try setup.recorder.startEpoch(1, of: .mic, at: 2200, sampleRate: Sweep.rate)
        try setup.write(seconds: 2200..<2201)
        try setup.recorder.startEpoch(2, of: .mic, at: 4400, sampleRate: Sweep.rate)
        try setup.write(seconds: 4400..<4401)

        let read = try setup.recorder.read(.mic, from: 2000, to: 4500)
        #expect(read.map(\.epoch) == [1, 2])
        #expect(read.map(\.start) == [2200, 4400])
        #expect(read.map(\.end) == [2201, 4401])
    }

    @Test func s7TheFolderIsRenamed() throws {
        let setup = try Setup()
        try setup.recorder.startEpoch(1, of: .mic, at: 0, sampleRate: Sweep.rate)
        try setup.write(seconds: 0..<10)

        let renamed = setup.files.root.appendingPathComponent("2026.10.22-0900 Renamed")
        try FileManager.default.moveItem(at: setup.folder, to: renamed)
        try setup.write(seconds: 10..<20)

        #expect(try setup.files.folder(of: setup.call).path == renamed.path)
        let read = try setup.recorder.read(.mic, from: 0, to: 20)
        #expect(read.map(\.samples) == [Sweep.samples(from: 0, seconds: 20)])
    }

    @Test func s8TheFolderVanishes() throws {
        let setup = try Setup()
        try setup.recorder.startEpoch(1, of: .mic, at: 0, sampleRate: Sweep.rate)
        try setup.write(seconds: 0..<10)

        try FileManager.default.removeItem(at: setup.folder)
        #expect {
            try setup.write(seconds: 10..<11)
        } throws: { error in
            (error as? RecordingFailure) == RecordingFailure(reason: .folderGone, time: 10)
        }

        #expect(!FileManager.default.fileExists(atPath: setup.folder.path))
        #expect((try? setup.files.folder(of: setup.call)) == nil)
        let read = (try? setup.recorder.read(.mic, from: 0, to: 11)) ?? []
        #expect(read.allSatisfy { $0.end <= 10 })
    }

    @Test func s9Stop() throws {
        let setup = try Setup()
        for track in Track.allCases {
            try setup.recorder.startEpoch(1, of: track, at: 0, sampleRate: Sweep.rate)
            try setup.write(seconds: 0..<40, to: track)
        }

        setup.recorder.stop()

        for track in Track.allCases {
            #expect(try setup.fileSeconds(track) == [30, 10])
            #expect(try setup.recorder.read(track, from: 0, to: 40).map(\.samples) == [Sweep.samples(from: 0, seconds: 40)])
        }
    }
}

// MARK: - Helpers

private struct Setup {
    let files: TempCallFiles
    let call = CallID()
    let folder: URL
    let recorder: Recorder

    init(root: URL? = nil) throws {
        let root = root ?? FileManager.default.temporaryDirectory
            .appendingPathComponent("audelin-recorder-\(UUID().uuidString)")
        files = TempCallFiles(root: root)
        folder = try files.makeFolder("2026.10.22-0900 Zoom", for: call)
        recorder = Recorder(call: call, files: files)
    }

    func write(seconds: Range<Int>, to track: Track = .mic) throws {
        for second in seconds {
            try recorder.write(Sweep.samples(from: Double(second), seconds: 1), to: track)
        }
    }

    /// The track's audio files on disk, in time order.
    func audioFiles(_ track: Track) throws -> [URL] {
        let audio = try files.folder(of: call).appendingPathComponent("audio")
        let names = (try? FileManager.default.contentsOfDirectory(atPath: audio.path)) ?? []
        return names
            .filter { $0.hasPrefix(track.rawValue) }
            .sorted()
            .map { audio.appendingPathComponent($0) }
    }

    /// How many seconds of samples each of the track's files holds.
    func fileSeconds(_ track: Track) throws -> [Double] {
        try audioFiles(track).map { url in
            let size = try FileManager.default.attributesOfItem(atPath: url.path)[.size] as! Int
            return Double((size - 44) / 4) / Sweep.rate
        }
    }

    static var crashChild: URL {
        Bundle(for: BundleMarker.self).bundleURL
            .deletingLastPathComponent()
            .appendingPathComponent("recorder-crash-child")
    }
}

private final class BundleMarker {}

/// The call-files double, with a disk that fills after `files` files: the
/// next file is created but its first write fails.
private final class FullAfter: CallFiles, @unchecked Sendable {
    private let files: TempCallFiles
    private var left: Int

    init(_ files: TempCallFiles, files count: Int) {
        self.files = files
        left = count
    }

    func create(_ path: String, in call: CallID) throws(CallFileError) -> any CallFile {
        let file = try files.create(path, in: call)
        left -= 1
        return left < 0 ? FullFile(file) : file
    }

    func paths(in directory: String, of call: CallID) throws(CallFileError) -> [String] {
        try files.paths(in: directory, of: call)
    }

    func size(of path: String, in call: CallID) throws(CallFileError) -> Int {
        try files.size(of: path, in: call)
    }

    func read(_ path: String, in call: CallID, offset: Int, count: Int) throws(CallFileError) -> Data {
        try files.read(path, in: call, offset: offset, count: count)
    }
}

private final class FullFile: CallFile, @unchecked Sendable {
    private let file: any CallFile

    init(_ file: any CallFile) { self.file = file }

    var size: Int { file.size }
    func append(_ data: Data) throws(CallFileError) { throw .diskFull }
    func write(_ data: Data, at offset: Int) throws(CallFileError) { throw .diskFull }
    func truncate(to size: Int) throws(CallFileError) { try file.truncate(to: size) }
    func close() { file.close() }
}

/// A small disk image that fills up, mounted for one test.
private struct DiskImage {
    let mountPoint: URL
    private let image: URL

    init(megabytes: Int) throws {
        let base = FileManager.default.temporaryDirectory
            .appendingPathComponent("audelin-full-\(UUID().uuidString)")
        image = base.appendingPathExtension("dmg")
        mountPoint = base
        try Self.hdiutil(["create", "-size", "\(megabytes)m", "-fs", "HFS+", "-volname", "audelin-full", image.path])
        try FileManager.default.createDirectory(at: mountPoint, withIntermediateDirectories: true)
        try Self.hdiutil(["attach", "-nobrowse", "-mountpoint", mountPoint.path, image.path])
    }

    func detach() {
        try? Self.hdiutil(["detach", mountPoint.path, "-force"])
        try? FileManager.default.removeItem(at: image)
    }

    private static func hdiutil(_ arguments: [String]) throws {
        let process = Process()
        process.executableURL = URL(fileURLWithPath: "/usr/bin/hdiutil")
        process.arguments = arguments
        process.standardOutput = FileHandle.nullDevice
        try process.run()
        process.waitUntilExit()
        guard process.terminationStatus == 0 else { throw CocoaError(.fileWriteUnknown) }
    }
}
