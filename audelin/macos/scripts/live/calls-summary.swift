import AppKit
import ApplicationServices
import CoreGraphics

private struct LiveFailure: Error, CustomStringConvertible {
    let description: String
    init(_ description: String) { self.description = description }
}

private func attribute(_ element: AXUIElement, _ name: String) -> CFTypeRef? {
    var result: CFTypeRef?
    guard AXUIElementCopyAttributeValue(element, name as CFString, &result) == .success else { return nil }
    return result
}

private func string(_ element: AXUIElement, _ name: String) -> String {
    attribute(element, name) as? String ?? ""
}

private func descendants(_ root: AXUIElement) -> [AXUIElement] {
    var result: [AXUIElement] = [], pending = [root]
    var seen = Set<CFHashCode>()
    while let element = pending.popLast() {
        guard seen.insert(CFHash(element)).inserted else { continue }
        result.append(element)
        pending += attribute(element, kAXChildrenAttribute) as? [AXUIElement] ?? []
    }
    return result
}

/// Both accessibility and directory events wake the same run loop; no periodic timer drives assertions.
@MainActor private final class Driver {
    let process: Process
    let root: AXUIElement
    private let observer: AXObserver
    private let files: [DispatchSourceFileSystemObject]
    private var registered = Set<String>()
    private var expired = false

    init(process: Process, folders: [URL]) throws {
        self.process = process
        root = AXUIElementCreateApplication(process.processIdentifier)
        var observer: AXObserver?
        let error = AXObserverCreate(process.processIdentifier, { _, _, _, _ in
            CFRunLoopStop(CFRunLoopGetMain())
        }, &observer)
        guard error == .success, let observer else { throw LiveFailure("AXObserverCreate: \(error.rawValue)") }
        self.observer = observer
        var watches: [DispatchSourceFileSystemObject] = []
        for folder in folders {
            let fd = open(folder.path, O_EVTONLY)
            guard fd >= 0 else {
                watches.forEach { $0.cancel() }
                throw LiveFailure("Cannot watch \(folder.path)")
            }
            let source = DispatchSource.makeFileSystemObjectSource(fileDescriptor: fd, eventMask: .write, queue: .main)
            source.setEventHandler { CFRunLoopStop(CFRunLoopGetMain()) }
            source.setCancelHandler { close(fd) }
            source.resume()
            watches.append(source)
        }
        files = watches
        process.terminationHandler = { _ in DispatchQueue.main.async { CFRunLoopStop(CFRunLoopGetMain()) } }
        CFRunLoopAddSource(CFRunLoopGetMain(), AXObserverGetRunLoopSource(observer), .defaultMode)
    }

    func stop() {
        files.forEach { $0.cancel() }
        CFRunLoopRemoveSource(CFRunLoopGetMain(), AXObserverGetRunLoopSource(observer), .defaultMode)
    }

    private func observe() {
        let notifications = [kAXWindowCreatedNotification, kAXLayoutChangedNotification,
                             kAXValueChangedNotification, kAXUIElementDestroyedNotification,
                             kAXSelectedChildrenChangedNotification, kAXFocusedUIElementChangedNotification,
                             kAXTitleChangedNotification, kAXCreatedNotification, kAXMenuOpenedNotification, kAXMenuClosedNotification]
        for element in descendants(root) {
            for notification in notifications {
                let key = "\(CFHash(element))-\(notification)"
                guard !registered.contains(key) else { continue }
                if AXObserverAddNotification(observer, element, notification as CFString, nil) == .success {
                    registered.insert(key)
                }
            }
        }
    }

    func wait<T>(_ description: String, _ read: () throws -> T?) throws -> T {
        expired = false
        let guardTimer = Timer(timeInterval: 45, repeats: false) { [weak self] _ in
            MainActor.assumeIsolated { self?.expired = true }
            CFRunLoopStop(CFRunLoopGetMain())
        }
        RunLoop.main.add(guardTimer, forMode: .default)
        defer { guardTimer.invalidate() }
        while true {
            observe()
            if let result = try read() { return result }
            if expired || !process.isRunning {
                let tree = descendants(root).map {
                    "\(string($0, kAXRoleAttribute)) \(string($0, kAXIdentifierAttribute)) label=\(string($0, kAXTitleAttribute)) value=\(string($0, kAXValueAttribute))"
                }.joined(separator: "\n")
                throw LiveFailure("Waiting for \(description) failed\n\(tree)")
            }
            CFRunLoopRun()
        }
    }

    func element(_ identifier: String, value: ((String) -> Bool)? = nil) throws -> AXUIElement {
        try wait(identifier) {
            guard descendants(root).contains(where: { string($0, kAXIdentifierAttribute) == "calls.window" }) else { return nil }
            return descendants(root).first {
                string($0, kAXIdentifierAttribute) == identifier && (value?(string($0, kAXValueAttribute)) ?? true)
            }
        }
    }

    func press(_ identifier: String) throws {
        let target = try element(identifier)
        let error = AXUIElementPerformAction(target, kAXPressAction as CFString)
        guard error == .success else { throw LiveFailure("Press \(identifier): \(error.rawValue)") }
    }

    func screenshot(_ name: String, into folder: URL) throws {
        let windows = CGWindowListCopyWindowInfo([.optionOnScreenOnly, .excludeDesktopElements], kCGNullWindowID) as? [[String: Any]] ?? []
        guard let window = windows.first(where: {
            ($0[kCGWindowOwnerPID as String] as? Int32) == process.processIdentifier && ($0[kCGWindowLayer as String] as? Int) == 0
        }), let number = window[kCGWindowNumber as String] as? Int else { throw LiveFailure("No visible calls window") }
        let path = folder.appendingPathComponent(name + ".png")
        let capture = Process()
        capture.executableURL = URL(fileURLWithPath: "/usr/sbin/screencapture")
        capture.arguments = ["-x", "-l", String(number), path.path]
        try capture.run()
        capture.waitUntilExit()
        guard capture.terminationStatus == 0, FileManager.default.fileExists(atPath: path.path) else {
            throw LiveFailure("Screenshot failed: \(path.path)")
        }
        print("Screenshot: \(path.path)")
    }
}

@main private enum CallsSummaryLive {
    @MainActor static func main() async {
        do {
            guard CommandLine.arguments.count == 2 else { throw LiveFailure("Usage: calls-summary <CallsRehearsal executable>") }
            guard AXIsProcessTrusted() else { throw LiveFailure("The live driver needs Accessibility access in this logged-in session.") }
            let app = URL(fileURLWithPath: CommandLine.arguments[1]).standardizedFileURL
            let output = FileManager.default.temporaryDirectory.appendingPathComponent("audelin-summary-live-\(UUID())")
            try FileManager.default.createDirectory(at: output, withIntermediateDirectories: true)
            print("Artifacts: \(output.path)")
            for cancel in [false, true] { try await scenario(app: app, output: output, cancel: cancel) }
            try await templateMenuVersionsKeepingFailureAndCancellation(app: app, output: output)
            print("PASS: summary completion, template menu, versions, keeping, failure and cancellation")
        } catch {
            fputs("FAIL: \(error)\n", stderr)
            exit(1)
        }
    }

    @MainActor private static func templateMenuVersionsKeepingFailureAndCancellation(app: URL, output: URL) async throws {
        let fixture = output.appendingPathComponent("templates")
        let calls = fixture.appendingPathComponent("calls")
        let call = calls.appendingPathComponent("2024.01.01-1000")
        let state = fixture.appendingPathComponent("state")
        let control = state.appendingPathComponent("control")
        let templates = state.appendingPathComponent("Templates")
        for folder in [call, control, templates] { try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true) }
        try "# Transcript\n\n**Me** 00:00:03\n\nОбсудили выпуск Audelin.\n".write(to: call.appendingPathComponent("transcript.md"), atomically: true, encoding: .utf8)
        let anotherCall = calls.appendingPathComponent("2024.01.01-0900")
        try FileManager.default.createDirectory(at: anotherCall, withIntermediateDirectories: true)
        try "# Transcript\n\n**Me** 00:00:03\n\nДругой звонок.\n".write(to: anotherCall.appendingPathComponent("transcript.md"), atomically: true, encoding: .utf8)
        try "Другие итоги.".write(to: anotherCall.appendingPathComponent("summary.md"), atomically: true, encoding: .utf8)
        let legacy = "## О чём встреча\n\nПрежние итоги звонка.\n"
        try legacy.write(to: call.appendingPathComponent("summary.md"), atomically: true, encoding: .utf8)
        let application = Process()
        application.executableURL = app
        application.arguments = ["--calls", calls.path, "--state", state.path, "--trash", fixture.appendingPathComponent("trash").path]
        try application.run()
        defer { if application.isRunning { application.terminate() } }
        let driver = try Driver(process: application, folders: [control, call])
        defer { driver.stop() }
        do {
            try driver.press("calls.select.2024.01.01-1000")
            _ = try driver.element("preview.notes", value: { $0.contains("Прежние итоги звонка.") && $0.contains("Шаблон: Default") })
            // An existing empty templates folder exercises the built-in Default entry.
            try openTemplateMenu(driver, keeping: true)
            try driver.press("preview.template.Default")
            try requestStarted(driver, control: control, request: 1)
            _ = try driver.element("preview.remaking", value: { $0 == "Делаю заново · Default…" })
            _ = try driver.element("preview.notes", value: { $0.contains("Прежние итоги звонка.") })
            let first = notes("Первый выпуск")
            try first.write(to: control.appendingPathComponent("finish-1"), atomically: true, encoding: .utf8)
            try shown(driver, topic: "Первый выпуск")
            try selectVersion(driver, title: "Предыдущие", topic: "Прежние итоги звонка.")
            try selectVersion(driver, title: "Текущие", topic: "Первый выпуск")

            // A second publication rotates Current and drops the older Previous.
            try openTemplateMenu(driver, keeping: true)
            try driver.press("preview.template.Default")
            try requestStarted(driver, control: control, request: 2)
            try notes("Второй выпуск").write(to: control.appendingPathComponent("finish-2"), atomically: true, encoding: .utf8)
            try shown(driver, topic: "Второй выпуск")
            try selectVersion(driver, title: "Предыдущие", topic: "Первый выпуск")
            try selectVersion(driver, title: "Текущие", topic: "Второй выпуск")
            try driver.screenshot("template-versions", into: output)
            let pairFiles = try publishedNotes(in: call)
            for outcome in ["failure", "cancel"] {
                let request = outcome == "failure" ? 3 : 4
                try openTemplateMenu(driver, keeping: true)
                try driver.press("preview.template.Default")
                try requestStarted(driver, control: control, request: request)
                _ = try driver.element("preview.remaking")
                if outcome == "failure" {
                    try Data().write(to: control.appendingPathComponent("fail-3"))
                    _ = try driver.element("preview.remakeFailure", value: { $0 == "Квота сервиса исчерпана." })
                } else {
                    try driver.press("preview.cancel")
                    _ = try driver.wait("cancelled regeneration") { FileManager.default.fileExists(atPath: control.appendingPathComponent("cancelled-4").path) ? true : nil }
                }
                _ = try driver.wait("regeneration settled") {
                    let elements = descendants(driver.root)
                    return !elements.contains { string($0, kAXIdentifierAttribute) == "preview.remaking" } ? true : nil
                }
                try shown(driver, topic: "Второй выпуск")
                guard try publishedNotes(in: call) == pairFiles else { throw LiveFailure("\(outcome) changed the published pair") }
                try selectVersion(driver, title: "Предыдущие", topic: "Первый выпуск")
                try selectVersion(driver, title: "Текущие", topic: "Второй выпуск")
                try driver.screenshot("template-\(outcome)", into: output)
            }
            try openTemplateMenu(driver, keeping: true)
            try driver.press("preview.keepPrevious")
            try driver.press("calls.select.2024.01.01-0900")
            _ = try driver.element("preview.notes", value: { $0.contains("Другие итоги.") })
            try openTemplateMenu(driver, keeping: false)
            let menu = try driver.element("preview.template.Default")
            if AXUIElementPerformAction(menu, kAXCancelAction as CFString) != .success {
                let parent = attribute(menu, kAXParentAttribute) as! AXUIElement
                guard AXUIElementPerformAction(parent, kAXCancelAction as CFString) == .success else { throw LiveFailure("Cannot close template menu") }
            }
            try driver.press("calls.select.2024.01.01-1000")
            try shown(driver, topic: "Второй выпуск")
            try openTemplateMenu(driver, keeping: false)
            try driver.press("preview.template.Default")
            try requestStarted(driver, control: control, request: 5)
            try notes("Только новые итоги").write(to: control.appendingPathComponent("finish-5"), atomically: true, encoding: .utf8)
            try shown(driver, topic: "Только новые итоги")
            guard !descendants(driver.root).contains(where: { string($0, kAXIdentifierAttribute) == "preview.versions" }) else { throw LiveFailure("Replacement retained the version switch") }
            let files = try publishedNotes(in: call)
            guard files.count == 1, files["summary.md"].map({ String(decoding: $0, as: UTF8.self).hasSuffix(notes("Только новые итоги")) }) == true, try previousText(in: call) == nil else { throw LiveFailure("Replacement retained older notes") }
            try driver.screenshot("template-replacement", into: output)
            try editedTemplateIsRefreshed(driver, templates: templates, control: control)
            application.terminate()
            _ = try driver.wait("app termination") { application.isRunning ? nil : true }
        } catch {
            try? driver.screenshot("template-scenario-failure", into: output)
            throw error
        }
    }

    @MainActor private static func editedTemplateIsRefreshed(_ driver: Driver, templates: URL, control: URL) throws {
        for (request, instruction) in [(6, "Use the first custom instructions"), (7, "Use the edited custom instructions")] {
            let metadata: [String: Any] = ["name": "Review", "headings": [["О чём встреча", "Ключевые моменты", "Решения", "Задачи"].map { ["name": $0, "required": true] as [String: Any] }]]
            let json = try JSONSerialization.data(withJSONObject: metadata, options: .sortedKeys)
            let template = "---\n" + String(decoding: json, as: UTF8.self) + "\n---\n" + instruction + "\n"
            try template.write(to: templates.appendingPathComponent("Review.md"), atomically: true, encoding: .utf8)
            try openTemplateMenu(driver, keeping: false)
            try driver.press("preview.template.Review")
            try requestStarted(driver, control: control, request: request)
            _ = try driver.element("preview.remaking", value: { $0 == "Делаю заново · Review…" })
            let topic = "Проверка шаблона \(request)"
            try notes(topic).write(to: control.appendingPathComponent("finish-\(request)"), atomically: true, encoding: .utf8)
            _ = try driver.element("preview.notes", value: { $0.contains(topic) && $0.contains("Шаблон: Review") })
            let body = try String(contentsOf: control.appendingPathComponent("request-\(request).json"), encoding: .utf8)
            guard body.contains(instruction), request != 7 || !body.contains("Use the first custom instructions") else { throw LiveFailure("The edited template did not reach generation") }
        }
    }

    @MainActor private static func openTemplateMenu(_ driver: Driver, keeping: Bool) throws {
        try driver.press("preview.notesMenu")
        let heading = try driver.element("preview.menuSection")
        guard string(heading, kAXTitleAttribute) == "СДЕЛАТЬ ЗАНОВО" else { throw LiveFailure("Wrong menu section") }
        _ = try driver.wait("keeping check \(keeping)") {
            descendants(driver.root).first {
                string($0, kAXIdentifierAttribute) == "preview.keepPrevious" &&
                !string($0, kAXMenuItemMarkCharAttribute).isEmpty == keeping
            }
        }
        _ = try driver.element("preview.template.Default")
    }

    @MainActor private static func requestStarted(_ driver: Driver, control: URL, request: Int) throws {
        _ = try driver.wait("request \(request) started") { FileManager.default.fileExists(atPath: control.appendingPathComponent("started-\(request)").path) ? true : nil }
    }

    @MainActor private static func shown(_ driver: Driver, topic: String) throws {
        _ = try driver.element("preview.notes", value: { $0.contains(topic) && $0.contains("Шаблон: Default") })
    }

    @MainActor private static func selectVersion(_ driver: Driver, title: String, topic: String) throws {
        let control = try driver.element("preview.versions")
        let segment: AXUIElement = try driver.wait("version \(title)") {
            descendants(control).first { string($0, kAXTitleAttribute) == title || string($0, kAXDescriptionAttribute) == title }
        }
        guard AXUIElementPerformAction(segment, kAXPressAction as CFString) == .success else { throw LiveFailure("Cannot choose \(title)") }
        try shown(driver, topic: topic)
    }

    private static func notes(_ topic: String) -> String {
        "## О чём встреча\n\n\(topic)\n\n## Ключевые моменты\n\nПроверяем итоги.\n\n## Решения\n\nВыпустить обновление.\n\n## Задачи\n\nПроверить выпуск [00:03].\n"
    }

    private static func previousText(in call: URL) throws -> String? {
        let text = try String(contentsOf: call.appendingPathComponent("summary.md"), encoding: .utf8)
        guard let header = text.components(separatedBy: "\n").first,
              header.hasPrefix("<!-- audelin-summary:"), header.hasSuffix(" -->"),
              let data = Data(base64Encoded: String(header.dropFirst(21).dropLast(4))),
              let receipt = try JSONSerialization.jsonObject(with: data) as? [String: Any] else { throw LiveFailure("Missing notes receipt") }
        return (receipt["previous"] as? [String: Any])?["text"] as? String
    }

    private static func publishedNotes(in call: URL) throws -> [String: Data] {
        let files = try FileManager.default.contentsOfDirectory(at: call, includingPropertiesForKeys: nil)
        return try Dictionary(uniqueKeysWithValues: files.filter { $0.lastPathComponent.hasPrefix("summary") && $0.pathExtension == "md" }.map { ($0.lastPathComponent, try Data(contentsOf: $0)) })
    }

    @MainActor private static func scenario(app: URL, output: URL, cancel: Bool) async throws {
        let fixture = output.appendingPathComponent(cancel ? "cancel" : "complete")
        let calls = fixture.appendingPathComponent("calls")
        let call = calls.appendingPathComponent("2024.01.01-1000")
        let state = fixture.appendingPathComponent("state")
        let control = state.appendingPathComponent("control")
        for folder in [call, control] { try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true) }
        try "# Transcript\n\n**Me** 00:00:03\n\nОбсудили выпуск Audelin.\n".write(to: call.appendingPathComponent("transcript.md"), atomically: true, encoding: .utf8)
        let application = Process()
        application.executableURL = app
        application.arguments = ["--calls", calls.path, "--state", state.path, "--trash", fixture.appendingPathComponent("trash").path]
        try application.run()
        defer { if application.isRunning { application.terminate() } }
        let driver = try Driver(process: application, folders: [control, call])
        defer { driver.stop() }
        do { try steps(driver: driver, application: application, output: output, control: control, call: call, cancel: cancel) }
        catch {
            try? driver.screenshot(cancel ? "cancel-failure" : "failure", into: output)
            throw error
        }
    }

    @MainActor private static func steps(driver: Driver, application: Process, output: URL,
                                         control: URL, call: URL, cancel: Bool) throws {
        try driver.press("calls.select.2024.01.01-1000")
        _ = try driver.element("preview.empty", value: { $0 == "Нет итогов" })
        if cancel { try driver.press("preview.make") }
        else {
            try driver.press("preview.notesMenu")
            let section = try driver.element("preview.menuSection")
            guard string(section, kAXTitleAttribute) == "СДЕЛАТЬ" else { throw LiveFailure("A call without notes has the wrong menu section") }
            try driver.press("preview.template.Default")
        }
        _ = try driver.element("preview.making", value: { $0 == "Делаю…" })
        _ = try driver.element("preview.cancel", value: { $0 == "Отменить" })
        _ = try driver.wait("fake request started") { FileManager.default.fileExists(atPath: control.appendingPathComponent("started-1").path) ? true : nil }
        try driver.screenshot(cancel ? "cancel-making" : "making", into: output)
        if cancel {
            try driver.press("preview.cancel")
            _ = try driver.element("preview.empty", value: { $0 == "Нет итогов" })
            _ = try driver.wait("cancelled request and removed files") {
                let cancelled = FileManager.default.fileExists(atPath: control.appendingPathComponent("cancelled-1").path)
                let remaining = try FileManager.default.contentsOfDirectory(atPath: call.path)
                return cancelled && !remaining.contains(".summary-job.json") && !remaining.contains("summary.md") ? true : nil
            }
            // A late completion for a cancelled attempt must not create notes.
            try Data().write(to: control.appendingPathComponent("finish-1"))
            try driver.screenshot("cancelled", into: output)
        } else {
            try Data().write(to: control.appendingPathComponent("finish-1"))
            _ = try driver.element("preview.notes", value: { $0.contains("Обсудили выпуск Audelin.") && $0.contains("Сделано ") })
            _ = try driver.element("preview.made", value: { $0.hasPrefix("Сделано ") && $0.count > "Сделано ".count })
            let notes = try String(contentsOf: call.appendingPathComponent("summary.md"), encoding: .utf8)
            guard notes.contains("## О чём встреча\n\nОбсудили выпуск Audelin.") else { throw LiveFailure("Wrong notes file") }
            try driver.screenshot("completed", into: output)
        }
        application.terminate()
        _ = try driver.wait("app termination") { application.isRunning ? nil : true }
        if cancel {
            for name in ["summary.md", ".summary-job.json"] where FileManager.default.fileExists(atPath: call.appendingPathComponent(name).path) {
                throw LiveFailure("Cancelled call retained \(name)")
            }
        }
    }
}
