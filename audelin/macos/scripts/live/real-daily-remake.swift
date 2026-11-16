// Remakes notes with Daily on real calls in the running, installed Audelin, the way a user does:
// select the call, open the notes menu, check that Keep previous is on, choose Daily, wait for the new
// notes. It reads nothing but accessibility, and never writes into the calls folder.
// Before it touches a call it backs up that call's notes files to ~/.audelin/live-backups/<run>/
// (restore with restore-live-backup.sh), and afterwards it checks that the receipt's Previous
// matches the backed-up notes.
// Usage (through run-driver.sh): real-daily-remake <call id>...
import AppKit
import ApplicationServices

private struct LiveFailure: Error, CustomStringConvertible { let description: String; init(_ d: String) { description = d } }
private func attribute(_ e: AXUIElement, _ n: String) -> CFTypeRef? { var r: CFTypeRef?; return AXUIElementCopyAttributeValue(e, n as CFString, &r) == .success ? r : nil }
private func string(_ e: AXUIElement, _ n: String) -> String { attribute(e, n) as? String ?? "" }
private func descendants(_ root: AXUIElement) -> [AXUIElement] {
    var result: [AXUIElement] = [], pending = [root], seen = Set<CFHashCode>()
    while let e = pending.popLast() {
        guard seen.insert(CFHash(e)).inserted else { continue }
        result.append(e); pending += attribute(e, kAXChildrenAttribute) as? [AXUIElement] ?? []
    }
    return result
}

/// Copies each call's notes files out of the calls folder and checks every copy byte for byte.
/// Drivers never write audio or transcripts, so those are left out.
private struct Backup {
    let calls: URL, run: URL
    static let notesFile = { (name: String) in name == ".summary-job.json" || (name.hasPrefix("summary") && name.hasSuffix(".md")) }
    static func callsFolder() -> URL {
        let home = FileManager.default.homeDirectoryForCurrentUser
        if let data = try? Data(contentsOf: home.appendingPathComponent(".audelin/preferences.json")),
           let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
           let folder = json["callsFolder"] as? String, let url = URL(string: folder) { return url }
        return home.appendingPathComponent("Recordings/Audelin", isDirectory: true)
    }
    func folder(of call: String) throws -> URL {
        let names = try FileManager.default.contentsOfDirectory(atPath: calls.path)
        let matches = names.filter { $0 == call || $0.hasPrefix(call + " ") }
        guard matches.count == 1 else { throw LiveFailure("Expected one folder for \(call) in \(calls.path), found \(matches)") }
        return calls.appendingPathComponent(matches[0], isDirectory: true)
    }
    func save(_ calls: [String]) throws {
        let fm = FileManager.default
        try fm.createDirectory(at: run, withIntermediateDirectories: true)
        try Data(self.calls.path.utf8).write(to: run.appendingPathComponent("calls-folder"))
        for call in calls {
            let source = try folder(of: call)
            let target = run.appendingPathComponent(source.lastPathComponent, isDirectory: true)
            try fm.createDirectory(at: target, withIntermediateDirectories: true)
            for name in try fm.contentsOfDirectory(atPath: source.path) where Self.notesFile(name) {
                let from = source.appendingPathComponent(name), to = target.appendingPathComponent(name)
                try fm.copyItem(at: from, to: to)
                guard try Data(contentsOf: from) == Data(contentsOf: to) else { throw LiveFailure("Backup of \(from.path) differs") }
            }
            let copied = Set(try fm.contentsOfDirectory(atPath: target.path))
            let wanted = Set(try fm.contentsOfDirectory(atPath: source.path).filter(Self.notesFile))
            guard copied == wanted else { throw LiveFailure("Backup of \(call) is incomplete: \(wanted.subtracting(copied))") }
        }
    }
    /// The notes body without the receipt line the app writes first.
    static func body(_ text: String) -> String {
        guard text.hasPrefix("<!-- audelin-summary:"), let newline = text.firstIndex(of: "\n") else { return text }
        return String(text[text.index(after: newline)...])
    }
    static func previous(_ text: String) -> String? {
        guard text.hasPrefix("<!-- audelin-summary:"), let newline = text.firstIndex(of: "\n") else { return nil }
        let line = text[..<newline]
        guard line.hasSuffix(" -->"), let payload = Data(base64Encoded: String(line.dropFirst(21).dropLast(4))),
              let json = try? JSONSerialization.jsonObject(with: payload) as? [String: Any],
              let previous = json["previous"] as? [String: Any] else { return nil }
        return previous["text"] as? String
    }
    /// The job record's phase, once the job running in the call is a different one from the backed-up one.
    /// Reading the file is how the driver knows a remake finished: notes already made with Daily
    /// look the same in the window before and after.
    func finishedPhase(_ call: String) throws -> String? {
        let source = try folder(of: call)
        func job(_ url: URL) -> [String: Any]? {
            (try? Data(contentsOf: url.appendingPathComponent(".summary-job.json"))).flatMap { try? JSONSerialization.jsonObject(with: $0) as? [String: Any] }
        }
        let before = job(run.appendingPathComponent(source.lastPathComponent))?["job"] as? String
        guard let now = job(source), let id = now["job"] as? String, id != before,
              let phase = now["phase"] as? String, ["succeeded", "failed", "interrupted"].contains(phase) else { return nil }
        return phase
    }
    /// Whether the receipt's Previous is the notes that were current before the run.
    func preserved(_ call: String) throws -> Bool {
        let source = try folder(of: call)
        let saved = run.appendingPathComponent(source.lastPathComponent).appendingPathComponent("summary.md")
        let now = try String(contentsOf: source.appendingPathComponent("summary.md"), encoding: .utf8)
        guard let before = try? String(contentsOf: saved, encoding: .utf8) else { return Self.previous(now) == nil }
        return Self.previous(now) == Self.body(before)
    }
}

@MainActor private struct Driver {
    let root: AXUIElement
    func first(_ id: String, _ value: ((String) -> Bool)? = nil) -> AXUIElement? {
        descendants(root).first { string($0, kAXIdentifierAttribute) == id && (value?(string($0, kAXValueAttribute)) ?? true) }
    }
    /// Generation takes minutes, so this polls every half second up to `seconds`.
    func wait<T>(_ what: String, seconds: Double = 30, _ read: () -> T?) throws -> T {
        let end = Date().addingTimeInterval(seconds)
        while Date() < end {
            if let r = read() { return r }
            RunLoop.main.run(until: Date().addingTimeInterval(0.5))
        }
        let tree = descendants(root).map { "\(string($0, kAXRoleAttribute)) \(string($0, kAXIdentifierAttribute)) title=\(string($0, kAXTitleAttribute)) value=\(string($0, kAXValueAttribute).prefix(80))" }.joined(separator: "\n")
        throw LiveFailure("Waiting for \(what) failed\n\(tree)")
    }
    func press(_ id: String) throws {
        let e = try wait(id) { first(id) }
        // Opening a menu blocks until it closes, so AX reports cannotComplete while it stays open.
        let action = string(e, kAXRoleAttribute) == kAXMenuItemRole ? kAXPickAction : kAXPressAction
        let error = AXUIElementPerformAction(e, action as CFString)
        guard error == .success || error == .cannotComplete else { throw LiveFailure("Press \(id) failed: \(error.rawValue)") }
    }
}

@main private enum RealDailyRemake {
    @MainActor static func main() {
        do {
            guard AXIsProcessTrusted() else { throw LiveFailure("The live driver needs Accessibility access.") }
            guard let app = NSRunningApplication.runningApplications(withBundleIdentifier: "dev.igor1309.audelin").first
                ?? NSWorkspace.shared.runningApplications.first(where: { $0.executableURL?.path == "/Applications/Audelin.app/Contents/MacOS/Audelin" })
            else { throw LiveFailure("Audelin is not running") }
            let driver = Driver(root: AXUIElementCreateApplication(app.processIdentifier))
            if driver.first("calls.window") == nil {
                // Open the calls window from the app's menu-bar item, as a user does.
                guard let extras = attribute(driver.root, "AXExtrasMenuBar"), CFGetTypeID(extras) == AXUIElementGetTypeID() else { throw LiveFailure("No menu-bar item") }
                let bar = extras as! AXUIElement
                let items = attribute(bar, kAXChildrenAttribute) as? [AXUIElement] ?? []
                guard let item = items.first else { throw LiveFailure("No menu-bar item") }
                let opened = AXUIElementPerformAction(item, kAXPressAction as CFString)
                guard opened == .success else {
                    var names: CFArray?; AXUIElementCopyActionNames(item, &names)
                    throw LiveFailure("Cannot open the menu-bar item: \(opened.rawValue) \(items.count) \(string(item, kAXRoleAttribute)) \((names as? [String]) ?? [])")
                }
                let calls = try driver.wait("Calls… item") { descendants(driver.root).first { string($0, kAXTitleAttribute) == "Calls…" || string($0, kAXDescriptionAttribute) == "Calls…" } }
                guard AXUIElementPerformAction(calls, kAXPressAction as CFString) == .success else { throw LiveFailure("Cannot press Calls…") }
            }
            let calls = Array(CommandLine.arguments.dropFirst())
            let stamp = ISO8601DateFormatter().string(from: Date()).replacingOccurrences(of: ":", with: "")
            let backup = Backup(calls: Backup.callsFolder(), run: FileManager.default.homeDirectoryForCurrentUser
                .appendingPathComponent(".audelin/live-backups/real-daily-remake-\(stamp)", isDirectory: true))
            try backup.save(calls)
            print("Backup: \(backup.run.path)")
            print("Restore: sh macos/scripts/live/restore-live-backup.sh '\(backup.run.path)'")
            _ = try driver.wait("calls window") { driver.first("calls.window") }
            for call in calls {
                try driver.press("calls.select." + call)
                _ = try driver.wait("notes of \(call)") { driver.first("preview.notes") }
                try driver.press("preview.notesMenu")
                _ = try driver.wait("Keep previous on") {
                    descendants(driver.root).first { string($0, kAXIdentifierAttribute) == "preview.keepPrevious" && !string($0, kAXMenuItemMarkCharAttribute).isEmpty }
                }
                // Picking an item of a menu another process opened does not reach SwiftUI's action;
                // highlight Daily and press Return, as the keyboard does.
                let daily = try driver.wait("Daily item") { driver.first("preview.template.Daily") }
                AXUIElementSetAttributeValue(daily, kAXSelectedAttribute as CFString, kCFBooleanTrue)
                RunLoop.main.run(until: Date().addingTimeInterval(0.3))
                for down in [true, false] { CGEvent(keyboardEventSource: nil, virtualKey: 36, keyDown: down)?.postToPid(app.processIdentifier) }
                _ = try driver.wait("remaking \(call)") { driver.first("preview.remaking") ?? driver.first("preview.made") { $0.contains("Daily") } }
                let phase = try driver.wait("new Daily notes of \(call)", seconds: 600) { try? backup.finishedPhase(call) }
                guard phase == "succeeded" else { throw LiveFailure("\(call): the remake ended \(phase)") }
                _ = try driver.wait("Daily notes of \(call)") {
                    driver.first("preview.remaking") == nil ? driver.first("preview.notes") { $0.contains("Daily") } : nil
                }
                if let failure = driver.first("preview.remakeFailure") { throw LiveFailure("\(call): \(string(failure, kAXValueAttribute))") }
                _ = try driver.wait("version switch") { driver.first("preview.versions") }
                print("REMADE: \(call)")
            }
            var lost: [String] = []
            for call in calls {
                let kept = try backup.preserved(call)
                print("\(kept ? "PRESERVED" : "LOST"): \(call) previous notes")
                if !kept { lost.append(call) }
            }
            guard lost.isEmpty else { throw LiveFailure("Previous notes not preserved for \(lost)") }
            print("PASS: remade with Daily, previous notes preserved")
        } catch { fputs("FAIL: \(error)\n", stderr); exit(1) }
        exit(0)
    }
}
