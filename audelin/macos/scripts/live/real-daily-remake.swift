// Remakes notes with Daily on real calls in the running, installed Audelin, the way a user does:
// select the call, open the notes menu, check that Keep previous is on, choose Daily, wait for the new
// notes. It reads nothing but accessibility, and never writes into the calls folder.
// Usage (through run-driver.sh): real-daily-remake <call folder name>...
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
            _ = try driver.wait("calls window") { driver.first("calls.window") }
            for call in CommandLine.arguments.dropFirst() {
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
                _ = try driver.wait("Daily notes of \(call)", seconds: 600) {
                    driver.first("preview.remaking") == nil ? driver.first("preview.notes") { $0.contains("Daily") } : nil
                }
                if let failure = driver.first("preview.remakeFailure") { throw LiveFailure("\(call): \(string(failure, kAXValueAttribute))") }
                _ = try driver.wait("version switch") { driver.first("preview.versions") }
                print("REMADE: \(call)")
            }
            print("PASS: remade with Daily, keeping previous")
        } catch { fputs("FAIL: \(error)\n", stderr); exit(1) }
        exit(0)
    }
}
