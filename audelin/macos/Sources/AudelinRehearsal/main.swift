import AppKit
import CallAppProcesses
import CallFolder
import Compose
import Foundation
import LiveText
import struct MicrophoneCapture.AudioPiece
import Observation
import PanelUI
import SessionRehearsal
import SwiftUI
import struct SystemAudioCapture.AudioPiece

// A long synthetic call through the real session and panel: both tracks
// recorded, Live text on, the transcript written, and the panel on screen,
// fed faster than real time so a profiler sees a 3-hour call in minutes.

let options: Options
do { options = try Options(Array(CommandLine.arguments.dropFirst())) } catch {
    FileHandle.standardError.write(Data("\(error)\n\(Options.usage)\n".utf8))
    exit(64)
}

let application = NSApplication.shared
application.setActivationPolicy(.regular)
let shown = Shown()
private let host = SignpostedPanelHost(rootView: ShownPanel(shown: shown))
let window = NSWindow(
    contentRect: NSRect(x: 0, y: 0, width: PanelConfig.glassLedger.panelWidth, height: 640),
    styleMask: [.titled, .resizable], backing: .buffered, defer: false
)
window.title = "Audelin rehearsal"
window.contentView = host
window.center()
window.makeKeyAndOrderFront(nil)

Task { @MainActor in
    let code = await rehearse(options, updatePanel: { shown.state = $0 })
    exit(code)
}
application.run()

/// The panel's latest state, for the window to draw.
@MainActor @Observable
final class Shown {

    var state = PanelState(recording: .off, log: .empty)
}

private struct ShownPanel: View {

    let shown: Shown

    var body: some View {

        PanelView(state: shown.state, event: { _ in })
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
    }
}

@MainActor
private func rehearse(_ options: Options, updatePanel: @escaping @MainActor (PanelState) -> Void) async -> Int32 {

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
    let microphone = Feed<MicrophoneCapture.AudioPiece>(), call = Feed<SystemAudioCapture.AudioPiece>()

    let pieces = SessionPieces(
        folder: CallFolder(callsURL: root, now: { Date() }, timeZone: .current),
        processes: CallAppProcesses(app: "meeting", list: OneCallApp()),
        startMicrophone: { microphone.started() },
        startCall: { _ in call.started() },
        microphoneRecognizer: mine, callRecognizer: theirs,
        missingModels: { [] }
    )
    let panel = AudelinPanel(makeReading: makeReading)
    let sessions = RecordingSessions(
        makePieces: { _ in pieces }, liveText: { true }, report: { _, _ in }, panel: panel,
        makeSession: { await makeSession(handler: $0) }
    )
    let showing = Task { @MainActor in
        for await state in await panel.states() { updatePanel(state) }
    }

    report("recording into \(root.path)")
    let begun = await sessions.begin(id: 1)
    guard begun == .ready else {
        report("the session did not start: \(begun)")
        return 1
    }

    let rate = 48_000.0, micFrames = 1024, callFrames = 512
    let micPiece = MicrophoneCapture.AudioPiece(samples: .init(repeating: 0.25, count: micFrames), sampleRate: rate)
    let callPiece = SystemAudioCapture.AudioPiece(samples: .init(repeating: -0.25, count: callFrames), sampleRate: rate)
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

    await sessions.end(id: 1)
    showing.cancel()
    let wall = started.duration(to: clock.now).seconds
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

private struct OneCallApp: ProcessList {

    func processes() -> [AudioProcess] {

        [AudioProcess(pid: 72, bundleID: "meeting", name: "meeting", isAudelin: false)]
    }
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
