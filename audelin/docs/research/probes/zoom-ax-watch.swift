// Unattended spike for LAB-1123: waits for a Zoom meeting and records Zoom's AX tree.
// Installed by zoom-ax-watch-install.sh as a LaunchAgent. While Zoom shows a meeting
// window it dumps the tree every 2 s for up to 10 min per meeting into
// ~/Library/Logs/audelin-zoom-ax/<time>.txt. Output names real people: trim before committing.
import AppKit
import ApplicationServices

let logs = FileManager.default.homeDirectoryForCurrentUser.appendingPathComponent("Library/Logs/audelin-zoom-ax")
try? FileManager.default.createDirectory(at: logs, withIntermediateDirectories: true)
_ = AXIsProcessTrustedWithOptions([kAXTrustedCheckOptionPrompt.takeUnretainedValue() as String: true] as CFDictionary)

func attribute(_ element: AXUIElement, _ name: String) -> CFTypeRef? {
    var value: CFTypeRef?
    return AXUIElementCopyAttributeValue(element, name as CFString, &value) == .success ? value : nil
}
func dump(_ element: AXUIElement, depth: Int, into out: inout String) {
    guard depth < 40 else { return }
    let fields = [kAXRoleAttribute, kAXSubroleAttribute, kAXTitleAttribute, kAXDescriptionAttribute, kAXValueAttribute, kAXIdentifierAttribute, kAXHelpAttribute]
        .compactMap { name in attribute(element, name).map { "\(name.replacingOccurrences(of: "AX", with: ""))=\($0)" } }
    out += String(repeating: "  ", count: depth) + fields.joined(separator: " ") + "\n"
    for child in attribute(element, kAXChildrenAttribute) as? [AXUIElement] ?? [] { dump(child, depth: depth + 1, into: &out) }
}
func meetingWindows(_ app: AXUIElement) -> [AXUIElement] {
    (attribute(app, kAXWindowsAttribute) as? [AXUIElement] ?? []).filter {
        let title = (attribute($0, kAXTitleAttribute) as? String ?? "").lowercased()
        return title.contains("meeting") || title.contains("конференц") || title.contains("webinar")
    }
}

var file: FileHandle?
var started = Date.distantPast
while true {
    let zoom = NSRunningApplication.runningApplications(withBundleIdentifier: "us.zoom.xos").first
    let app = zoom.map { AXUIElementCreateApplication($0.processIdentifier) }
    let inMeeting = AXIsProcessTrusted() && app.map { !meetingWindows($0).isEmpty } == true
    if inMeeting, file == nil {
        let url = logs.appendingPathComponent("\(ISO8601DateFormatter().string(from: Date())).txt")
        FileManager.default.createFile(atPath: url.path, contents: nil)
        file = try? FileHandle(forWritingTo: url); started = Date()
    }
    if !inMeeting { try? file?.close(); file = nil }
    if let handle = file, let app, Date().timeIntervalSince(started) < 600 {
        var out = "=== \(Date().timeIntervalSince1970)\n"
        for window in attribute(app, kAXWindowsAttribute) as? [AXUIElement] ?? [] { dump(window, depth: 0, into: &out) }
        handle.write(Data(out.utf8))
    }
    Thread.sleep(forTimeInterval: 2)
}
