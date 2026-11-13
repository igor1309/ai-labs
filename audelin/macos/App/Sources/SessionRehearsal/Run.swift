import AVFoundation
import AppKit
import Composer
import Foundation
import LiveText
import Synchronization

// A long call through the app's composition and panel: a call app joins,
// detection starts the recording, both tracks are recorded, Live text is on,
// the transcript is written and the panel floats on screen. The call app then
// leaves and detection ends the recording. The voices say what each side
// speaks and which recogniser hears it.

/// Parses the command line, shows the app's panel and runs one rehearsal over
/// the voices `makeVoices` gives, then exits with its status.
@MainActor
public func rehearsalMain(_ makeVoices: @escaping @MainActor (RehearsalOptions) async throws -> any RehearsalVoices) {

    let options: RehearsalOptions
    do { options = try RehearsalOptions(Array(CommandLine.arguments.dropFirst())) } catch {
        FileHandle.standardError.write(Data("\(error)\n\(RehearsalOptions.usage)\n".utf8))
        exit(64)
    }
    reportPath.withLock { $0 = options.report }
    let application = NSApplication.shared
    application.setActivationPolicy(.regular)
    let panel = FloatingPanel.onScreen()
    Task { @MainActor in
        let voices: any RehearsalVoices
        do { voices = try await makeVoices(options) } catch {
            report("the recognisers did not start: \(error)")
            exit(1)
        }
        exit(await rehearse(options, voices: voices, panel: panel))
    }
    application.run()
}

/// Where to append the progress lines too, as a profiler hides stdout.
private let reportPath = Mutex<String?>(nil)

/// What each side says and which recogniser hears it.
public protocol RehearsalVoices: Sendable {

    var mine: any Recognizer { get }
    var theirs: any Recognizer { get }
    /// The rate of the audio both sides are fed.
    var rate: Double { get }
    /// The speech's length in seconds, when the voices are a recording.
    var length: Double? { get }
    /// How long the recognisers took to load, when they load a model.
    var modelLoad: Double? { get }
    /// Reports every audio minute with lags, instead of every ten.
    var measured: Bool { get }
    func mine(from start: Int, count: Int) -> CaptureBuffer
    func theirs(from start: Int, count: Int) -> CaptureBuffer
    /// How many seconds of audio both sides have been fed.
    func fed(_ seconds: Double)
    /// Seconds of audio the slower recogniser has heard.
    func heard() async -> Double
    /// The lags since the last line, or nothing.
    func lagLine() -> String
    /// The words each side said, as the last line tells them.
    func words() async -> String
}

/// The fake recognisers' sentences over steady tones, fed at 48 kHz.
public struct FakeVoices: RehearsalVoices {

    private let fakes: (mine: SpeakingRecognizer, theirs: SpeakingRecognizer)

    public init(_ options: RehearsalOptions) {
        fakes = (
            mine: SpeakingRecognizer(
                name: "mine", sentence: 8, pause: 4, offset: 0,
                monologue: options.monologueEvery.map { .init(every: $0, length: options.monologueLength) }
            ),
            theirs: SpeakingRecognizer(name: "theirs", sentence: 10, pause: 5, offset: 6)
        )
    }

    public var mine: any Recognizer { fakes.mine }
    public var theirs: any Recognizer { fakes.theirs }
    public var rate: Double { 48_000 }
    public var length: Double? { nil }
    public var modelLoad: Double? { nil }
    public var measured: Bool { false }
    public func mine(from start: Int, count: Int) -> CaptureBuffer { .init(samples: .init(repeating: 0.25, count: count), sampleRate: rate) }
    public func theirs(from start: Int, count: Int) -> CaptureBuffer { .init(samples: .init(repeating: -0.25, count: count), sampleRate: rate) }
    public func fed(_ seconds: Double) {}
    public func heard() async -> Double {
        Double(min(await fakes.mine.heardSamples, await fakes.theirs.heardSamples)) / rate
    }
    public func lagLine() -> String { "" }
    public func words() async -> String {
        "mine \(await fakes.mine.words) words, theirs \(await fakes.theirs.words) words"
    }
}

/// Speech for each side, looped, heard by two measured recognisers. One file
/// serves both sides unless `theirs` names another, as a recorded call's tracks do.
public struct SpeechVoices: RehearsalVoices {

    private let speech: Speech
    private let theirSpeech: Speech
    private let fedSeconds = Fed()
    private let measured_: (mine: Measured, theirs: Measured)
    public let modelLoad: Double?

    /// `mine` and `theirs` hear each side; `modelLoad` is how long making them took.
    public init(speech path: String, theirSpeech theirPath: String? = nil, mine: any Recognizer, theirs: any Recognizer, modelLoad: Double?) throws {
        speech = try Speech(path: path)
        theirSpeech = try theirPath.map(Speech.init(path:)) ?? speech
        guard speech.rate == theirSpeech.rate else { throw RehearsalOptions.Failure("both sides' speech must have one rate") }
        measured_ = (Measured(mine, fed: fedSeconds), Measured(theirs, fed: fedSeconds))
        self.modelLoad = modelLoad
    }

    public var mine: any Recognizer { measured_.mine }
    public var theirs: any Recognizer { measured_.theirs }
    public var rate: Double { speech.rate }
    public var length: Double? { min(speech.seconds, theirSpeech.seconds) }
    public var measured: Bool { true }
    public func mine(from start: Int, count: Int) -> CaptureBuffer { .init(samples: speech.piece(from: start, count: count), sampleRate: rate) }
    public func theirs(from start: Int, count: Int) -> CaptureBuffer { .init(samples: theirSpeech.piece(from: start, count: count), sampleRate: rate) }
    public func fed(_ seconds: Double) { fedSeconds.set(seconds) }
    public func heard() async -> Double { min(measured_.mine.heard, measured_.theirs.heard) }
    public func lagLine() -> String {
        let lags = [measured_.mine.takeLags(), measured_.theirs.takeLags()]
        let newest = lags.flatMap(\.newest), final = lags.flatMap(\.final)
        return "; newest word trails by \(spread(newest)), final text by \(spread(final))"
    }
    public func words() async -> String { "real recognisers" }

    private func spread(_ values: [Double]) -> String {
        guard let low = values.min(), let high = values.max() else { return "no reports" }
        let mean = values.reduce(0, +) / Double(values.count)
        return "\(format(low))–\(format(high)) s, mean \(format(mean)) s over \(values.count)"
    }
}

@MainActor
private func rehearse(_ options: RehearsalOptions, voices: any RehearsalVoices, panel: FloatingPanel) async -> Int32 {

    let root = options.recordingsDirectory.map { URL(fileURLWithPath: $0, isDirectory: true) }
        ?? FileManager.default.temporaryDirectory.appendingPathComponent("audelin-rehearsal-\(ProcessInfo.processInfo.processIdentifier)")
    // A supplied directory belongs to the caller, which can clean it even after SIGTERM.
    defer { if options.recordingsDirectory == nil && !options.keep { try? FileManager.default.removeItem(at: root) } }
    do { try FileManager.default.createDirectory(at: root, withIntermediateDirectories: true) } catch {
        report("cannot make \(root.path): \(error)")
        return 1
    }

    if let load = voices.modelLoad { report("model loaded in \(format(load)) s") }
    let microphone = Feed<CaptureBuffer>(), call = Feed<CaptureBuffer>()

    var boundary = rehearsalBoundary(
        capturePersistence: .recorded,
        microphone: { microphone.started() }, call: { _ in call.started() },
        mine: RehearsalRecognizer(voices.mine), theirs: RehearsalRecognizer(voices.theirs),
        now: { Date() }, timeZone: { .current }, sleep: { try await ContinuousClock().sleep(for: $0) },
        intervals: rehearsalIntervals()
    )
    let callApp = RehearsalCallApp()
    boundary.processes = callApp
    let replay: BrowserReplay?
    do { replay = try options.browserEvents.map { try BrowserReplay(file: URL(fileURLWithPath: $0)) } } catch {
        report("cannot replay browser events: \(error)")
        return 1
    }
    if let replay { boundary.browser = { replay.channel } }
    let composition: AudelinMenu
    do {
        composition = try await startRehearsal(boundary: boundary, root: root, call: callApp,
                                               presentPanel: { [weak panel] in panel?.setVisible($0) })
    } catch {
        report("the session did not start: \(error)")
        return 1
    }
    panel.install(composition)
    let replaying = replay.map { replay in
        Task {
            do { try await replay.run() } catch { report("browser replay failed: \(error)") }
        }
    }
    report("call detected, recording into \(root.path)")

    let clock = ContinuousClock()
    let started = clock.now
    // The first panel state with text, timed from the first audio fed.
    let firstText = Task { @MainActor () -> Duration? in
        for await state in await composition.panelStates() {
            if case let .lines(lines) = state.log, lines.entries.contains(where: { !$0.settled.isEmpty || !$0.pending.isEmpty }) {
                return started.duration(to: clock.now)
            }
        }
        return nil
    }

    let rate = voices.rate, micFrames = 1024, callFrames = 512
    let seconds = (options.minutes ?? voices.length.map { $0 / 60 } ?? 180) * 60
    let every = voices.measured ? 60 : 600
    let cpuStarted = cpuSeconds()
    var micSent = 0, callSent = 0
    var behind = 0.0
    var reported = 0
    var audio = 0.0
    var peak = footprintMiB()
    var sampled = started
    while audio < seconds {
        try? await Task.sleep(for: .milliseconds(50))
        let elapsed = started.duration(to: clock.now)
        audio = min(seconds, elapsed.seconds * options.speed)
        let target = Int(audio * rate)
        while micSent + micFrames <= target { microphone.yield(voices.mine(from: micSent, count: micFrames)); micSent += micFrames }
        while callSent + callFrames <= target { call.yield(voices.theirs(from: callSent, count: callFrames)); callSent += callFrames }
        voices.fed(Double(min(micSent, callSent)) / rate)
        replay?.feed(Double(min(micSent, callSent)) / rate)

        let footprint = sampled.duration(to: clock.now) >= .seconds(1) ? footprintMiB() : nil
        if let footprint {
            sampled = clock.now
            peak = max(peak, footprint)
        }

        // How far the slower recogniser trails what was fed.
        let heard = await voices.heard()
        behind = max(behind, Double(min(micSent, callSent)) / rate - heard)
        if Int(audio) / every > reported {
            reported = Int(audio) / every
            let footprint = footprint ?? footprintMiB()
            peak = max(peak, footprint)
            let backlog = max(0, Double(min(micSent, callSent)) / rate - heard)
            report("\(reported * every / 60) min of audio in \(elapsed.seconds.rounded()) s, at most \(format(behind)) s behind, now \(format(backlog)) s\(voices.lagLine()), footprint \(footprint) MiB, peak \(peak) MiB")
        }
    }

    let wall = started.duration(to: clock.now).seconds
    let cpu = cpuSeconds() - cpuStarted
    // Detection waits 30 wall-clock seconds after the app leaves before it ends the call.
    report("call app left")
    let stopping = await endRehearsalCall(composition, call: callApp)
    replay?.finish()
    await replaying?.value
    report("call ended, recording stopped\(stopping.map { "; stop to final transcript \(format($0.seconds)) s" } ?? "")")
    firstText.cancel()
    let first = await firstText.value
    await composition.perform(.quit)
    report("""
        done: \(Int(seconds / 60)) min at \(options.speed)x in \(Int(wall)) s; \
        \(await voices.words()); \
        recognisers at most \(format(behind)) s behind; \
        cpu \(format(cpu)) s, \(Int((cpu / wall * 100).rounded()))% of one core; \
        footprint \(footprintMiB()) MiB at the end, peak \(max(peak, footprintMiB())) MiB
        """)
    report("first text after \(first.map { "\(format($0.seconds)) s" } ?? "none")")
    report(written(in: root, fed: seconds))
    return 0
}

/// What reached the disk: each track's length against what was fed, and the transcript's words per speaker.
private func written(in root: URL, fed: Double) -> String {

    let folders = (try? FileManager.default.contentsOfDirectory(at: root, includingPropertiesForKeys: nil))?
        .filter(\.hasDirectoryPath) ?? []
    guard folders.count == 1, let folder = folders.first else { return "written: \(folders.count) call folders, expected 1" }
    let tracks = ["microphone", "call"].map { name -> String in
        guard let file = try? AVAudioFile(forReading: folder.appendingPathComponent("\(name).caf")) else { return "\(name) unreadable" }
        return "\(name) \(format(Double(file.length) / file.fileFormat.sampleRate)) s"
    }
    guard let transcript = try? String(contentsOf: folder.appendingPathComponent("transcript.md"), encoding: .utf8) else {
        return "written: \(tracks.joined(separator: ", ")) of \(format(fed)) s fed; no transcript"
    }
    var words: [String: Int] = [:]
    var speaker = "?"
    for line in transcript.split(separator: "\n") {
        if line.hasPrefix("#") { continue }
        if line.hasPrefix("**"), let end = line.dropFirst(2).firstRange(of: "**") {
            speaker = String(line[line.index(line.startIndex, offsetBy: 2)..<end.lowerBound])
            continue
        }
        words[speaker, default: 0] += line.split(whereSeparator: \.isWhitespace).count
    }
    let spoken = words.sorted { $0.key < $1.key }.map { "\($0.key) \($0.value) words" }.joined(separator: ", ")
    return "written: \(tracks.joined(separator: ", ")) of \(format(fed)) s fed; transcript \(spoken.isEmpty ? "empty" : spoken)"
}

private func cpuSeconds() -> Double {

    var usage = rusage()
    getrusage(RUSAGE_SELF, &usage)
    func seconds(_ time: timeval) -> Double { Double(time.tv_sec) + Double(time.tv_usec) / 1e6 }
    return seconds(usage.ru_utime) + seconds(usage.ru_stime)
}

private func format(_ value: Double) -> String { value.formatted(.number.precision(.fractionLength(1))) }

/// A capture the rehearsal feeds by hand.
private final class Feed<Piece: Sendable>: Sendable {

    private let source = AsyncThrowingStream<Piece, any Error>.makeStream()

    func started() -> StartedCapture<Piece> {

        StartedCapture(stream: source.stream, stop: { self.source.continuation.finish() })
    }

    func yield(_ piece: Piece) { source.continuation.yield(piece) }
}

private func report(_ line: String) {

    let line = "rehearsal: \(line)\n"
    FileHandle.standardOutput.write(Data(line.utf8))
    if let path = reportPath.withLock({ $0 }) {
        if !FileManager.default.fileExists(atPath: path) { FileManager.default.createFile(atPath: path, contents: nil) }
        if let file = FileHandle(forWritingAtPath: path) {
            file.seekToEndOfFile()
            file.write(Data(line.utf8))
            try? file.close()
        }
    }
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

private extension Duration {

    var seconds: Double { Double(components.seconds) + Double(components.attoseconds) / 1e18 }
}
