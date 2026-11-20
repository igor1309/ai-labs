import AppKit
import CallDiarizer
import CallsRehearsalSupport
import CallsWindowShell
import Composer
import SessionRehearsal

@MainActor
final class CallsRehearsalDelegate: NSObject, NSApplicationDelegate {
    let options: CallsRehearsalOptions
    private var model: AudelinMenu?
    private var window: CallsWindow?
    private var windows: CallsWindows?
    private let settingsWindow = SettingsWindow.make()
    private var terminationReady = false

    init(options: CallsRehearsalOptions) {
        self.options = options
    }

    func applicationDidFinishLaunching(_ notification: Notification) {
        Task { await start() }
    }

    private func start() async {
        do { try await options.seedCalls() } catch {
            FileHandle.standardError.write(Data("Seeding calls failed: \(error)\n".utf8))
            exit(70)
        }
        startWithDefaultLayout()
        let nsWindow = NSWindow(contentRect: NSRect(origin: .zero, size: CallsWindow.firstSize),
                                styleMask: [.titled, .closable, .miniaturizable, .resizable], backing: .buffered, defer: false)
        nsWindow.setAccessibilityIdentifier("calls.window")
        let window = CallsWindow(makeWindow: { nsWindow }, title: "",
                                 activate: { NSApplication.shared.activate(ignoringOtherApps: true) })
        self.window = window
        let callWindow = CallWindowSlot()
        var boundary = rehearsalBoundary(
            capturePersistence: .recorded,
            microphone: { throw RehearsalInput.unavailable }, call: { _ in throw RehearsalInput.unavailable },
            mine: FixtureRecognizer(enabled: options.seed == .transcriptAgain, text: "Новый текст микрофона:"),
            theirs: FixtureRecognizer(enabled: options.seed == .transcriptAgain, text: "Новый текст звонка:"),
            now: { Date() }, timeZone: { .current }, sleep: { try await Task.sleep(for: $0) },
            intervals: rehearsalIntervals(),
            // The calls live tests check this release as the merger of what they merge.
            transcriptBuild: .init(version: "rehearsal", build: "1", mine: "unused", theirs: "unused"))
        let control = TranscriptFileControl(folder: options.controlFolder)
        boundary.recognizers = FixtureRecognizers(enabled: options.seed == .transcriptAgain ||
            FileManager.default.fileExists(atPath: options.controlFolder.appendingPathComponent("transcript-fixture").path), control: control)
        boundary.diarizer = FixtureDiarizer(control: control)
        let serial = boundary.callsOperation
        boundary.callsOperation = .init(take: { kind in
            try await serial.take(kind)
            do {
                switch kind {
                case .publishTranscript: try await control.wait("publishing")
                case .restorePreviousTranscript: try await control.wait("restoring")
                case .access: break
                }
            } catch { serial.give(); throw error }
        }, give: serial.give)
        let system = boundary.callsDisk
        boundary.callsDisk.rename = { source, target in
            try system.rename(source, target)
            if source.lastPathComponent == "transcript.md",
               target.deletingLastPathComponent().deletingLastPathComponent().lastPathComponent == "transcripts" {
                try control.movedCurrent()
            }
        }
        boundary.trash = options.trash
        let model = await compose(
            boundary: boundary, preferencesURL: options.preferencesURL,
            openCallsFolder: { [options] folder in
                // A live test checks what was opened; the rehearsal never opens Finder.
                let templates = folder.lastPathComponent == "Templates"
                if templates && FileManager.default.fileExists(atPath: options.controlFolder.appendingPathComponent("fail-open-templates").path) { return false }
                let marker = options.controlFolder.appendingPathComponent(templates ? "opened-templates" : "opened-\(UUID().uuidString)")
                return (try? Data(folder.path.utf8).write(to: marker)) != nil
            }, presentCalls: { window.show() },
            openURL: { NSWorkspace.shared.open($0) }, presentPanel: { _ in },
            terminate: { [weak self] in
                await MainActor.run {
                    self?.terminationReady = true
                    NSApplication.shared.terminate(nil)
                }
            }, presentSettings: { [settingsWindow] in
                NSApplication.shared.activate(ignoringOtherApps: true)
                settingsWindow.makeKeyAndOrderFront(nil)
            }, summaryRuntime: options.runtime(),
            copyNotes: { copyNotes($0, to: .general) }, readCall: { if let window = callWindow.window { presentCall(window, shown: { _ in }) } })
        self.model = model
        SettingsWindow.install(model, in: settingsWindow)
        window.retitle(model.callsListText(.windowTitle))
        NSApplication.shared.appearance = NSAppearance(named: .aqua)
        if let calls = model.calls {
            windows = CallsWindows(model: model, calls: calls, window: window, nsWindow: nsWindow,
                                   callWindow: callWindow, track: { _ in })
        }
        await model.perform(.showCalls)
        if ProcessInfo.processInfo.arguments.contains("--show-settings") { await model.perform(.showSettings) }
    }

    func applicationShouldTerminate(_ sender: NSApplication) -> NSApplication.TerminateReply {
        if terminationReady { return .terminateNow }
        guard let model else { return .terminateNow }
        Task { await model.perform(.quit) }
        return .terminateCancel
    }

    func applicationShouldHandleReopen(_ sender: NSApplication, hasVisibleWindows flag: Bool) -> Bool {
        if let model { Task { await model.perform(.showCalls) } }
        return true
    }
}

private enum RehearsalInput: Error { case unavailable }
/// Answers with its text and what it heard of the track: how many seconds and the loudest sample,
/// so a transcript shows which track reached it and whether all of it did. Nothing heard, nothing said.
private actor FixtureRecognizer: SpeechRecognizer {
    let enabled: Bool
    let text: String
    let control: TranscriptFileControl?
    private var seconds: Double = 0
    private var peak: Float = 0
    init(enabled: Bool, text: String, control: TranscriptFileControl? = nil) { self.enabled = enabled; self.text = text; self.control = control }
    func hear(_ chunk: SpeechAudio) async throws -> SpeechHearing {
        guard enabled else { throw RehearsalInput.unavailable }
        if seconds > 0 { try await control?.wait("hearing") }
        seconds += Double(chunk.samples.count) / chunk.sampleRate
        peak = chunk.samples.reduce(peak) { max($0, abs($1)) }
        return .init(words: [])
    }
    func finish() throws -> SpeechHearing {
        guard enabled else { throw RehearsalInput.unavailable }
        // One instance hears every track of its side, one run after another.
        defer { seconds = 0; peak = 0 }
        guard seconds > 0 else { return .init(words: []) }
        return .init(words: [.init("\(text) \(Int(seconds.rounded())) с, \(Int((peak * 100).rounded())) %.", start: 1, end: 2)], finalThrough: 2)
    }
}
private struct FixtureRecognizers: RecognizerSource {
    let enabled: Bool
    let control: TranscriptFileControl
    func recognizer(for side: ComposerSide) async throws -> any SpeechRecognizer {
        try await control.wait("preparing")
        return FixtureRecognizer(enabled: enabled, text: side == .microphone ? "Новый текст микрофона:" : "Новый текст звонка:", control: control)
    }
    func missingModels() -> [String] { [] }
    func startLoading() -> Task<Void, any Error> { Task {} }
}

private struct FixtureDiarizer: TranscriptDiarizer {
    let control: TranscriptFileControl
    func prepare() async {}
    func diarize(_ track: URL, speakers: Int?) async throws -> CallDiarizer.Diarization {
        try await control.wait("finishing")
        return .init(model: .nemotron, turns: [])
    }
}

let options: CallsRehearsalOptions
do {
    options = try CallsRehearsalOptions.parse(CommandLine.arguments.dropFirst().filter { $0 != "--show-settings" })
    try options.prepare()
} catch {
    FileHandle.standardError.write(Data("\(error)\n\(CallsRehearsalOptions.usage)\n".utf8))
    exit(64)
}
let application = NSApplication.shared
let delegate = CallsRehearsalDelegate(options: options)
application.setActivationPolicy(.regular)
application.delegate = delegate
application.run()
