import AppKit
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
    private var terminationReady = false

    init(options: CallsRehearsalOptions) {
        self.options = options
    }

    func applicationDidFinishLaunching(_ notification: Notification) {
        Task { await start() }
    }

    private func start() async {
        startWithDefaultLayout()
        let nsWindow = NSWindow(contentRect: NSRect(origin: .zero, size: CallsWindow.firstSize),
                                styleMask: [.titled, .closable, .miniaturizable, .resizable], backing: .buffered, defer: false)
        nsWindow.setAccessibilityIdentifier("calls.window")
        let window = CallsWindow(makeWindow: { nsWindow }, title: "",
                                 activate: { NSApplication.shared.activate(ignoringOtherApps: true) })
        self.window = window
        let callWindow = CallWindowSlot()
        let boundary = rehearsalBoundary(
            capturePersistence: .recorded,
            microphone: { throw RehearsalInput.unavailable }, call: { _ in throw RehearsalInput.unavailable },
            mine: UnusedRecognizer(), theirs: UnusedRecognizer(),
            now: { Date() }, timeZone: { .current }, sleep: { try await Task.sleep(for: $0) },
            intervals: rehearsalIntervals())
        let model = await compose(
            boundary: boundary, preferencesURL: options.preferencesURL,
            openCallsFolder: { NSWorkspace.shared.open($0) }, presentCalls: { window.show() },
            openURL: { NSWorkspace.shared.open($0) }, presentPanel: { _ in },
            terminate: { [weak self] in
                await MainActor.run {
                    self?.terminationReady = true
                    NSApplication.shared.terminate(nil)
                }
            }, summaryRuntime: options.runtime(),
            copyNotes: { copyNotes($0, to: .general) }, readCall: { if let window = callWindow.window { presentCall(window, shown: { _ in }) } })
        self.model = model
        window.retitle(model.callsListText(.windowTitle))
        NSApplication.shared.appearance = NSAppearance(named: .aqua)
        if let calls = model.calls {
            windows = CallsWindows(model: model, calls: calls, window: window, nsWindow: nsWindow,
                                   callWindow: callWindow, track: { _ in })
        }
        await model.perform(.showCalls)
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
private struct UnusedRecognizer: SpeechRecognizer {
    func hear(_ chunk: SpeechAudio) throws -> SpeechHearing { throw RehearsalInput.unavailable }
    func finish() throws -> SpeechHearing { throw RehearsalInput.unavailable }
}

let options: CallsRehearsalOptions
do {
    options = try CallsRehearsalOptions.parse(Array(CommandLine.arguments.dropFirst()))
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
