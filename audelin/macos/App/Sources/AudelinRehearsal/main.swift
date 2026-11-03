import AppKit
import Composer
import Foundation
import LiveText
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

    let mine = SpeakingRecognizer(
        name: "mine", sentence: 8, pause: 4, offset: 0,
        monologue: options.monologueEvery.map { .init(every: $0, length: options.monologueLength) }
    )
    let theirs = SpeakingRecognizer(name: "theirs", sentence: 10, pause: 5, offset: 6)
    let microphone = Feed<CaptureBuffer>(), call = Feed<CaptureBuffer>()

    var boundary = rehearsalBoundary(
        capturePersistence: .recorded,
        microphone: { microphone.started() }, call: { _ in call.started() },
        mine: RehearsalRecognizer(mine), theirs: RehearsalRecognizer(theirs),
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

    let rate = 48_000.0, micFrames = 1024, callFrames = 512
    let micPiece = CaptureBuffer(samples: .init(repeating: 0.25, count: micFrames), sampleRate: rate)
    let callPiece = CaptureBuffer(samples: .init(repeating: -0.25, count: callFrames), sampleRate: rate)
    let seconds = options.minutes * 60
    let clock = ContinuousClock()
    let started = clock.now
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
        while micSent + micFrames <= target { microphone.yield(micPiece); micSent += micFrames }
        while callSent + callFrames <= target { call.yield(callPiece); callSent += callFrames }

        let footprint = sampled.duration(to: clock.now) >= .seconds(1) ? footprintMiB() : nil
        if let footprint {
            sampled = clock.now
            peak = max(peak, footprint)
        }

        // How far the slower recogniser trails what was fed.
        let heard = min(await mine.heardSamples, await theirs.heardSamples)
        behind = max(behind, Double(min(micSent, callSent) - heard) / rate)
        if Int(audio) / 600 > reported {
            reported = Int(audio) / 600
            let footprint = footprint ?? footprintMiB()
            peak = max(peak, footprint)
            report("\(reported * 10) min of audio in \(elapsed.seconds.rounded()) s, at most \(behind.formatted(.number.precision(.fractionLength(1)))) s behind, footprint \(footprint) MiB, peak \(peak) MiB")
        }
    }

    let wall = started.duration(to: clock.now).seconds
    // Detection waits 30 wall-clock seconds after the app leaves before it ends the call.
    report("call app left")
    await endRehearsalCall(composition, call: callApp)
    report("call ended, recording stopped")
    await composition.perform(.quit)
    report("""
        done: \(Int(options.minutes)) min at \(options.speed)x in \(Int(wall)) s; \
        mine \(await mine.words) words, theirs \(await theirs.words) words; \
        recognisers at most \(behind.formatted(.number.precision(.fractionLength(1)))) s behind; footprint \(footprintMiB()) MiB at the end, peak \(max(peak, footprintMiB())) MiB
        """)
    return 0
}

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
