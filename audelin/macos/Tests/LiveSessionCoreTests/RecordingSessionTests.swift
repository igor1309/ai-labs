import CallDomain
import Foundation
import LiveSessionCore
import Testing

/// recording-session QA. The session runs on fakes of its ports and a fake
/// clock; a stuck recogniser that the session waited for would hang the
/// test into its time limit.
@Suite(.timeLimit(.minutes(1))) struct RecordingSessionTests {
    @Test func s1StartingARecording() async throws {
        let setup = Setup()
        let session = setup.session()
        var first = await session.states().makeAsyncIterator()
        var second = await session.states().makeAsyncIterator()
        #expect(await first.next() == .idle)
        #expect(await second.next() == .idle)

        let recording = try await session.start(title: "Zoom", app: "Zoom")

        #expect(recording.title == "Zoom")
        #expect(recording.start == Setup.now)
        #expect(await first.next() == .recording(recording))
        #expect(await second.next() == .recording(recording))
        #expect(setup.calls.created == [Created(title: "Zoom", start: Setup.now, app: "Zoom", id: recording.call)])
    }

    @Test func s2StoppingARecording() async throws {
        let setup = Setup()
        let session = setup.session()
        var first = await session.states().makeAsyncIterator()
        var second = await session.states().makeAsyncIterator()
        let recording = try await session.start(title: "Zoom", app: "Zoom")
        for _ in 0..<2 { _ = await (first.next(), second.next()) }
        setup.feedBoth(seconds: 20)

        await session.stop()

        #expect(await first.next() == .idle)
        #expect(await second.next() == .idle)
        let reader = setup.files.reader(for: recording.call)
        for track in Track.allCases {
            #expect(try reader.read(track, from: 0, to: 20) == [Tone.audio(track, from: 0, seconds: 20)])
        }
        #expect(setup.files.recording(recording.call).stopped)
        #expect(!setup.mic.isRunning)
        #expect(!setup.callAudio.isRunning)
        setup.feedBoth(seconds: 1)
        for track in Track.allCases {
            #expect(try reader.read(track, from: 0, to: 21) == [Tone.audio(track, from: 0, seconds: 20)])
        }
    }

    /// Recording holds the activity gate against a folder move until Stop
    /// (ADR-001 invariant 16).
    @Test func theGateIsHeldWhileRecording() async throws {
        let setup = Setup()
        let session = setup.session()
        try await session.start(title: "Zoom", app: "Zoom")

        await #expect(throws: GateRefusal.self) { try await setup.gate.request(.move) }
        do {
            _ = try await setup.gate.request(.move)
        } catch {
            #expect(error.holder == .recording)
        }

        await session.stop()

        let move = try await setup.gate.request(.move)
        setup.gate.release(move)
    }

    /// Recognition hears of every written piece on the session clock, for
    /// the recording's call, and its stream ends at Stop.
    @Test func recognitionIsToldWhatIsWritten() async throws {
        let spy = RecognitionSpy()
        let setup = Setup(recognition: spy)
        let session = setup.session()
        let recording = try await session.start(title: "Zoom", app: "Zoom")
        setup.feedBoth(seconds: 1)

        await session.stop()
        let heard = await spy.ended()

        #expect(heard.call == recording.call)
        for track in Track.allCases {
            let ends = heard.written.filter { $0.track == track }
            #expect(ends.map(\.epoch) == Array(repeating: 1, count: 10))
            #expect(ends.map { ($0.end * 10).rounded() } == (1...10).map(Double.init))
        }
    }

    /// Two starts waiting on the gate at once make one call and one hold.
    @Test func twoStartsAtOnce() async throws {
        let setup = Setup()
        let session = setup.session()
        let yields = Yields()
        let catchUp = await setup.gate.requestCatchUp(onYield: { yields.add() }).hold()

        let recordings = try await withThrowingTaskGroup(of: Recording.self) { group in
            for _ in 0..<2 { group.addTask { try await session.start(title: "Zoom", app: "Zoom") } }
            await yields.wait(for: 2)
            setup.gate.release(catchUp)
            return try await group.reduce(into: []) { $0.append($1) }
        }

        #expect(recordings.count == 2)
        #expect(recordings[0] == recordings[1])
        #expect(setup.calls.created.count == 1)
        await session.stop()
        let move = try await setup.gate.request(.move)
        setup.gate.release(move)
    }

    @Test func s3StoppingWithTheRecogniserStuck() async throws {
        let setup = Setup(recognition: StuckRecogniser())
        let session = setup.session()
        var states = await session.states().makeAsyncIterator()
        try await session.start(title: "Zoom", app: "Zoom")
        for _ in 0..<2 { _ = await states.next() }
        setup.feedBoth(seconds: 5)

        await session.stop()

        #expect(await states.next() == .idle)
    }

    @Test func s4StoppingWithNoLiveModel() async throws {
        let setup = Setup(recognition: ModelStillDownloading())
        let session = setup.session()
        var states = await session.states().makeAsyncIterator()
        try await session.start(title: "Zoom", app: "Zoom")
        for _ in 0..<2 { _ = await states.next() }
        setup.feedBoth(seconds: 5)

        await session.stop()

        #expect(await states.next() == .idle)
    }

    @Test func s5AudioIsReadableAsSoonAsItIsWritten() async throws {
        let setup = Setup()
        let session = setup.session()
        let recording = try await session.start(title: "Zoom", app: "Zoom")

        setup.feedBoth(seconds: 5)

        let reader = setup.files.reader(for: recording.call)
        for track in Track.allCases {
            #expect(try reader.read(track, from: 0, to: 5) == [Tone.audio(track, from: 0, seconds: 5)])
        }
        #expect(!setup.files.recording(recording.call).stopped)
    }

    @Test func s6RecordingNeverWaitsForRecognition() async throws {
        let setup = Setup(recognition: StuckRecogniser())
        let session = setup.session()
        let recording = try await session.start(title: "Zoom", app: "Zoom")

        setup.feedBoth(seconds: 600)

        let reader = setup.files.reader(for: recording.call)
        for track in Track.allCases {
            #expect(try reader.read(track, from: 0, to: 600) == [Tone.audio(track, from: 0, seconds: 600)])
        }
        #expect(setup.mic.delivered == 6_000)
        #expect(setup.callAudio.delivered == 6_000)
    }

    @Test func s7StartingDuringAFolderMove() async throws {
        let setup = Setup()
        let session = setup.session()
        _ = try await setup.gate.request(.move)

        await #expect(throws: StartRefusal.moving) {
            try await session.start(title: "Zoom", app: "Zoom")
        }

        #expect(setup.calls.created.isEmpty)
        #expect(setup.files.calls.isEmpty)
        #expect(!setup.mic.isRunning)
        #expect(!setup.callAudio.isRunning)
    }

    @Test func s8ASecondStartWhileRecording() async throws {
        let setup = Setup()
        let session = setup.session()
        var states = await session.states().makeAsyncIterator()
        let recording = try await session.start(title: "Zoom", app: "Zoom")

        let again = try await session.start(title: "Meet", app: "Google Chrome")
        await session.stop()

        #expect(again == recording)
        #expect(setup.calls.created.count == 1)
        #expect(await states.next() == .idle)
        #expect(await states.next() == .recording(recording))
        #expect(await states.next() == .idle)
    }

    /// The session's part: the call's details are written at the start, and
    /// every sample reaches the writer as it comes. That a dropped session
    /// loses at most the open file is the recorder's S-4.
    @Test func s9ASessionEndedWithoutStop() async throws {
        let setup = Setup()
        var session: RecordingSession? = setup.session()
        let recording = try await session!.start(title: "Zoom", app: "Zoom")
        setup.feedBoth(seconds: 75)

        session = nil

        #expect(setup.calls.created.map(\.id) == [recording.call])
        let reader = setup.files.reader(for: recording.call)
        for track in Track.allCases {
            #expect(try reader.read(track, from: 0, to: 75) == [Tone.audio(track, from: 0, seconds: 75)])
        }
        #expect(!setup.files.recording(recording.call).stopped)
    }
}

// MARK: - Fakes

private struct Setup {
    static let now = Date(timeIntervalSince1970: 1_792_600_000)
    static let startUptime: TimeInterval = 1_000

    let mic = FakeCapture(track: .mic)
    let callAudio = FakeCapture(track: .call)
    let files = FakeFiles()
    let calls = FakeCalls()
    let gate = ActivityGate()
    let clock = FakeClock(now: Setup.now, uptime: Setup.startUptime)
    let recognition: any LiveRecognition

    init(recognition: any LiveRecognition = StuckRecogniser()) {
        self.recognition = recognition
    }

    func session() -> RecordingSession {
        RecordingSession(
            mic: mic, callAudio: callAudio, files: files, calls: calls,
            recognition: recognition, gate: gate, clock: clock)
    }

    /// Both sides deliver `seconds` of their tones from the clock's uptime
    /// on, in 0.1 s buffers, and the clock moves past them.
    func feedBoth(seconds: Int) {
        let from = clock.uptime
        for buffer in 0..<(seconds * 10) {
            let time = Double(buffer) / 10
            mic.deliver(uptime: from + time, sessionTime: from + time - Setup.startUptime)
            callAudio.deliver(uptime: from + time, sessionTime: from + time - Setup.startUptime)
        }
        clock.uptime = from + Double(seconds)
    }
}

/// A distinct tone per track, so a track read back can only match its own.
private enum Tone {
    static let sampleRate = 1_000.0

    static func samples(_ track: Track, from time: TimeInterval, seconds: TimeInterval) -> [Float] {
        let first = Int((time * sampleRate).rounded())
        let frequency: Float = track == .mic ? 50 : 125
        return (first..<(first + Int(seconds * sampleRate))).map {
            sin(2 * .pi * frequency * Float($0) / Float(sampleRate))
        }
    }

    static func audio(_ track: Track, from time: TimeInterval, seconds: TimeInterval) -> RecordedAudio {
        RecordedAudio(epoch: 1, start: time, sampleRate: sampleRate, samples: samples(track, from: time, seconds: seconds))
    }
}

private final class FakeCapture: AudioCapture, @unchecked Sendable {
    let track: Track
    private let lock = NSLock()
    private var onAudio: (@Sendable (CapturedAudio) -> Void)?
    private var deliveries = 0

    init(track: Track) { self.track = track }

    var isRunning: Bool { lock.withLock { onAudio != nil } }
    /// Buffers whose handler returned.
    var delivered: Int { lock.withLock { deliveries } }

    func start(onAudio: @escaping @Sendable (CapturedAudio) -> Void) {
        lock.withLock { self.onAudio = onAudio }
    }

    func stop() {
        lock.withLock { onAudio = nil }
    }

    func deliver(uptime: TimeInterval, sessionTime: TimeInterval) {
        guard let onAudio = lock.withLock({ self.onAudio }) else { return }
        onAudio(CapturedAudio(
            uptime: uptime, sampleRate: Tone.sampleRate,
            samples: Tone.samples(track, from: sessionTime, seconds: 0.1)))
        lock.withLock { deliveries += 1 }
    }
}

private final class FakeClock: SessionClock, @unchecked Sendable {
    private let lock = NSLock()
    private var current: (now: Date, uptime: TimeInterval)

    init(now: Date, uptime: TimeInterval) { current = (now, uptime) }

    var now: Date { lock.withLock { current.now } }
    var uptime: TimeInterval {
        get { lock.withLock { current.uptime } }
        set { lock.withLock { current.uptime = newValue } }
    }
}

private struct Created: Equatable {
    let title: String
    let start: Date
    let app: String
    let id: CallID
}

private final class FakeCalls: NewCalls, @unchecked Sendable {
    private let lock = NSLock()
    private var calls: [Created] = []

    var created: [Created] { lock.withLock { calls } }

    func create(title: String, details: CallDetails) throws(CallFileError) {
        lock.withLock { calls.append(Created(title: title, start: details.start, app: details.app, id: details.id)) }
    }
}

/// One call's recording, kept in memory: one piece per track and epoch.
private final class FakeRecording: RecordingWriter, RecordedAudioReader, @unchecked Sendable {
    private let lock = NSLock()
    private var pieces: [Track: RecordedAudio] = [:]
    private var isStopped = false

    var stopped: Bool { lock.withLock { isStopped } }

    func startEpoch(_ epoch: Int, of track: Track, at time: TimeInterval, sampleRate: Double) throws(RecordingFailure) {
        lock.withLock { pieces[track] = RecordedAudio(epoch: epoch, start: time, sampleRate: sampleRate, samples: []) }
    }

    func write(_ samples: [Float], to track: Track) throws(RecordingFailure) {
        lock.withLock {
            guard let piece = pieces[track] else { return }
            pieces[track] = RecordedAudio(
                epoch: piece.epoch, start: piece.start, sampleRate: piece.sampleRate,
                samples: piece.samples + samples)
        }
    }

    func stop() {
        lock.withLock { isStopped = true }
    }

    func read(_ track: Track, from start: TimeInterval, to end: TimeInterval) throws -> [RecordedAudio] {
        lock.withLock { pieces[track].map { [$0] } ?? [] }
    }
}

private final class FakeFiles: RecordingFiles, @unchecked Sendable {
    private let lock = NSLock()
    private var recordings: [CallID: FakeRecording] = [:]

    var calls: [CallID] { lock.withLock { Array(recordings.keys) } }

    func recording(_ call: CallID) -> FakeRecording {
        lock.withLock {
            if let recording = recordings[call] { return recording }
            let recording = FakeRecording()
            recordings[call] = recording
            return recording
        }
    }

    func writer(for call: CallID) -> any RecordingWriter { recording(call) }
    func reader(for call: CallID) -> any RecordedAudioReader { recording(call) }
}

/// A recogniser that keeps what it hears and tells when its stream ended.
private final class RecognitionSpy: LiveRecognition, @unchecked Sendable {
    private let lock = NSLock()
    private var heard: (call: CallID?, written: [WrittenAudio]) = (nil, [])
    private let (done, finished) = AsyncStream.makeStream(of: Void.self)

    func recognize(_ call: CallID, written: AsyncStream<WrittenAudio>) async {
        lock.withLock { heard.call = call }
        for await piece in written { lock.withLock { heard.written.append(piece) } }
        finished.yield()
    }

    /// What it heard, once its stream has ended.
    func ended() async -> (call: CallID?, written: [WrittenAudio]) {
        for await _ in done { break }
        return lock.withLock { heard }
    }
}

/// Counts catch-up's yields and lets a test wait for a number of them.
private final class Yields: @unchecked Sendable {
    private let lock = NSLock()
    private var count = 0
    private var waiter: (target: Int, resume: CheckedContinuation<Void, Never>)?

    func add() {
        let resume: CheckedContinuation<Void, Never>? = lock.withLock {
            count += 1
            guard let waiter, count >= waiter.target else { return nil }
            self.waiter = nil
            return waiter.resume
        }
        resume?.resume()
    }

    func wait(for target: Int) async {
        await withCheckedContinuation { resume in
            let now = lock.withLock {
                if count >= target { return true }
                waiter = (target, resume)
                return false
            }
            if now { resume.resume() }
        }
    }
}

/// A recogniser that never reads what is written and never returns.
private struct StuckRecogniser: LiveRecognition {
    func recognize(_ call: CallID, written: AsyncStream<WrittenAudio>) async {
        let nothing = AsyncStream<Never> { _ in }
        for await _ in nothing {}
    }
}

/// A recogniser waiting for a model that is still downloading.
private struct ModelStillDownloading: LiveRecognition {
    func recognize(_ call: CallID, written: AsyncStream<WrittenAudio>) async {
        let downloaded = AsyncStream<Void> { _ in }
        for await _ in downloaded {}
    }
}
