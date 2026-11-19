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
            mine: FixtureRecognizer(enabled: options.seed == .transcriptAgain, text: "Новый текст микрофона."),
            theirs: FixtureRecognizer(enabled: options.seed == .transcriptAgain, text: "Новый текст звонка."),
            now: { Date() }, timeZone: { .current }, sleep: { try await Task.sleep(for: $0) },
            intervals: rehearsalIntervals(),
            // The calls live tests check this release as the merger of what they merge.
            transcriptBuild: .init(version: "rehearsal", build: "1", mine: "unused", theirs: "unused"))
        boundary.diarizer = FixtureDiarizer()
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
private struct FixtureRecognizer: SpeechRecognizer {
    let enabled: Bool
    let text: String
    func hear(_ chunk: SpeechAudio) throws -> SpeechHearing {
        guard enabled else { throw RehearsalInput.unavailable }
        return .init(words: [])
    }
    func finish() throws -> SpeechHearing {
        guard enabled else { throw RehearsalInput.unavailable }
        return .init(words: [.init(text, start: 1, end: 2)], finalThrough: 2)
    }
}
private struct FixtureDiarizer: TranscriptDiarizer {
    func prepare() async {}
    func diarize(_ track: URL, speakers: Int?) async throws -> CallDiarizer.Diarization {
        .init(model: .nemotron, turns: [])
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
