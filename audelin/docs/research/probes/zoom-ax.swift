// Spike for LAB-1123: does Zoom expose its participants and speaking indicator through Accessibility?
//
// Run during a Zoom meeting with the Participants panel open, from a terminal that has
// the Accessibility permission (System Settings → Privacy & Security → Accessibility):
//   swift audelin/docs/research/probes/zoom-ax.swift [seconds] > zoom-ax.txt
// It dumps Zoom's AX tree once a second. Diff successive dumps while one person speaks:
// an element whose description or value changes with the speaker is the indicator.
// The output names real people: trim it before committing it as a fixture.
import AppKit
import ApplicationServices

let seconds = Int(CommandLine.arguments.dropFirst().first ?? "10") ?? 10
guard AXIsProcessTrusted() else { FileHandle.standardError.write(Data("No Accessibility permission\n".utf8)); exit(1) }
guard let zoom = NSRunningApplication.runningApplications(withBundleIdentifier: "us.zoom.xos").first else {
    FileHandle.standardError.write(Data("Zoom is not running\n".utf8)); exit(1)
}

func attribute(_ element: AXUIElement, _ name: String) -> CFTypeRef? {
    var value: CFTypeRef?
    return AXUIElementCopyAttributeValue(element, name as CFString, &value) == .success ? value : nil
}

func dump(_ element: AXUIElement, depth: Int) {
    guard depth < 40 else { return }
    let fields = [kAXRoleAttribute, kAXSubroleAttribute, kAXTitleAttribute, kAXDescriptionAttribute, kAXValueAttribute, kAXIdentifierAttribute, kAXHelpAttribute]
        .compactMap { name in attribute(element, name).map { "\(name.replacingOccurrences(of: "AX", with: ""))=\($0)" } }
    print(String(repeating: "  ", count: depth) + fields.joined(separator: " "))
    for child in attribute(element, kAXChildrenAttribute) as? [AXUIElement] ?? [] { dump(child, depth: depth + 1) }
}

let app = AXUIElementCreateApplication(zoom.processIdentifier)
for tick in 0..<seconds {
    print("=== t=\(tick) \(Date().timeIntervalSince1970)")
    for window in attribute(app, kAXWindowsAttribute) as? [AXUIElement] ?? [] { dump(window, depth: 0) }
    Thread.sleep(forTimeInterval: 1)
}
