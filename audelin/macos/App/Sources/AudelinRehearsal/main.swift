import AVFoundation
import AppKit
import Composer
import Foundation
import LiveText
import ParakeetRecognizer
import SessionRehearsal

// A long synthetic call through the app's composition and panel: a call app
// joins, detection starts the recording, both tracks are recorded, Live text
// is on, the transcript is written and the panel floats on screen, fed faster
// than real time so a profiler sees a 3-hour call in minutes. The call app
// then leaves and detection ends the recording.

let options: Options
do { options = try Options(Array(CommandLine.arguments.dropFirst())) } catch {
    FileHandle.standardError.write(Data("\(error)\n\(Options.usage)\n".utf8))
    exit(64)
}

let application = NSApplication.shared
application.setActivationPolicy(.regular)
let panel = FloatingPanel.onScreen()

Task { @MainActor in
    let code = await rehearse(options, panel: panel)
    exit(code)
}
application.run()

@MainActor
private func rehearse(_ options: Options, panel: FloatingPanel) async -> Int32 {

    let root = options.recordingsDirectory.map { URL(fileURLWithPath: $0, isDirectory: true) }
        ?? FileManager.default.temporaryDirectory.appendingPathComponent("audelin-rehearsal-\(ProcessInfo.processInfo.processIdentifier)")
    // A supplied directory belongs to the caller, which can clean it even after SIGTERM.
    defer { if options.recordingsDirectory == nil && !options.keep { try? FileManager.default.removeItem(at: root) } }
    do { try FileManager.default.createDirectory(at: root, withIntermediateDirectories: true) } catch {
        report("cannot make \(root.path): \(error)")
        return 1
    }

    let voices: Voices
    do { voices = try await Voices(options) } catch {
        report("the recognisers did not start: \(error)")
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
    let composition: AudelinMenu
    do {
        composition = try await startRehearsal(boundary: boundary, root: root, call: callApp,
                                               presentPanel: { [weak panel] in panel?.setVisible($0) })
    } catch {
        report("the session did not start: \(error)")
        return 1
    }
    panel.install(composition)
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
        voices.fed.set(Double(min(micSent, callSent)) / rate)

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

/// What each side says and who hears it: the fake recognisers' sentences
/// over steady tones, or a speech file through real Parakeet.
private struct Voices {

    let mine: any Recognizer
    let theirs: any Recognizer
    let rate: Double
    /// The speech's length in seconds; nil for the fakes.
    let length: Double?
    let modelLoad: Double?
    let fed = Fed()
    private let speech: Speech?
    private let fakes: (mine: SpeakingRecognizer, theirs: SpeakingRecognizer)?
    private let measured_: (mine: Measured, theirs: Measured)?

    var measured: Bool { measured_ != nil }

    @MainActor
    init(_ options: Options) async throws {

        if let path = options.speech {
            let speech = try Speech(path: path)
            let clock = ContinuousClock(), loading = clock.now
            let first = try await ParakeetRecognizer(), second = try await ParakeetRecognizer()
            modelLoad = loading.duration(to: clock.now).seconds
            let measured = (mine: Measured(first, fed: fed), theirs: Measured(second, fed: fed))
            self.speech = speech
            measured_ = measured
            fakes = nil
            mine = measured.mine
            theirs = measured.theirs
            rate = speech.rate
            length = speech.seconds
        } else {
            let fakes = (
                mine: SpeakingRecognizer(
                    name: "mine", sentence: 8, pause: 4, offset: 0,
                    monologue: options.monologueEvery.map { .init(every: $0, length: options.monologueLength) }
                ),
                theirs: SpeakingRecognizer(name: "theirs", sentence: 10, pause: 5, offset: 6)
            )
            self.fakes = fakes
            speech = nil
            measured_ = nil
            mine = fakes.mine
            theirs = fakes.theirs
            rate = 48_000
            length = nil
            modelLoad = nil
        }
    }

    func mine(from start: Int, count: Int) -> CaptureBuffer {
        CaptureBuffer(samples: speech?.piece(from: start, count: count) ?? .init(repeating: 0.25, count: count), sampleRate: rate)
    }

    func theirs(from start: Int, count: Int) -> CaptureBuffer {
        CaptureBuffer(samples: speech?.piece(from: start, count: count) ?? .init(repeating: -0.25, count: count), sampleRate: rate)
    }

    /// Seconds of audio the slower recogniser has heard.
    func heard() async -> Double {
        if let measured_ { return min(measured_.mine.heard, measured_.theirs.heard) }
        guard let fakes else { return 0 }
        return Double(min(await fakes.mine.heardSamples, await fakes.theirs.heardSamples)) / rate
    }

    /// The real recognisers' lags since the last line, or nothing for the fakes.
    func lagLine() -> String {
        guard let measured_ else { return "" }
        let lags = [measured_.mine.takeLags(), measured_.theirs.takeLags()]
        let newest = lags.flatMap(\.newest), final = lags.flatMap(\.final)
        return "; newest word trails by \(spread(newest)), final text by \(spread(final))"
    }

    func words() async -> String {
        guard let fakes else { return "real recognisers" }
        return "mine \(await fakes.mine.words) words, theirs \(await fakes.theirs.words) words"
    }

    private func spread(_ values: [Double]) -> String {
        guard let low = values.min(), let high = values.max() else { return "no reports" }
        let mean = values.reduce(0, +) / Double(values.count)
        return "\(format(low))–\(format(high)) s, mean \(format(mean)) s over \(values.count)"
    }
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
    if let path = options.report {
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
