import AppKit
import ApplicationServices
import AVFAudio

private let first = "2024.01.01-1000", second = "2024.01.01-1001", single = "2024.01.01-1012"
private let originalTitle = "[Zoom] Product and Release", firstTitle = "Product planning", secondTitle = "Release review"
private let firstWords = "Готовим план продукта.", secondWords = "Всем привет, обсуждаем релиз."

@main private enum CallsSplitLive {
    @MainActor static func main() async {
        do {
            guard CommandLine.arguments.count == 2 else { throw LiveFailure("Usage: calls-split <CallsRehearsal executable>") }
            guard AXIsProcessTrusted() else { throw LiveFailure("The live driver needs Accessibility access in this logged-in session.") }
            guard CGPreflightScreenCaptureAccess() else { throw LiveFailure("The live driver needs Screen Recording access.") }
            let app = URL(fileURLWithPath: CommandLine.arguments[1]).standardizedFileURL
            let root = FileManager.default.temporaryDirectory.appendingPathComponent("audelin-split-live-\(UUID())")
            let fixture = root.appendingPathComponent("fixture")
            let calls = fixture.appendingPathComponent("calls"), state = fixture.appendingPathComponent("state")
            let control = state.appendingPathComponent("control"), trash = fixture.appendingPathComponent("trash")
            for folder in [calls, control] { try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true) }
            defer { try? FileManager.default.removeItem(at: fixture) }
            print("Artifacts: \(root.path)")
            let process = Process()
            process.executableURL = app
            process.arguments = ["--calls", calls.path, "--state", state.path, "--trash", trash.path, "--seed", "split"]
            try process.run()
            defer { if process.isRunning { process.terminate() } }
            let driver = try Driver(process: process, folders: [calls, control])
            defer { driver.stop() }
            do {
                try splitAndMerge(driver, calls: calls, control: control, output: root)
            } catch {
                try? driver.screenshot("split-failure", into: root)
                let names = (try? FileManager.default.contentsOfDirectory(atPath: calls.path)) ?? []
                print("Calls folder: \(names.sorted())")
                throw error
            }
            process.terminate()
            _ = try driver.wait("app termination") { process.isRunning ? nil : true }
            print("PASS: split availability, boundary context and title defaults, cancellation, both parts’ titles, transcripts, speakers, audio, tags and new notes, and the merged cut marker and timeline")
        } catch {
            fputs("FAIL: \(error)\n", stderr)
            exit(1)
        }
    }

    @MainActor private static func splitAndMerge(_ driver: Driver, calls: URL, control: URL, output: URL) throws {
        try driver.press("calls.select.\(single)")
        _ = try driver.element("calls.split", value: { $0.contains("нет границы") })
        try driver.press("calls.select.\(first)")
        try openSplit(driver)

        let longest = try driver.element("calls.split.choice.75", value: {
            $0.contains("Всем привет") && $0.contains("всем пока") && $0.contains("похоже на смену встречи")
        })
        let middle = try driver.element("calls.split.choice.89")
        let shortest = try driver.element("calls.split.choice.15")
        guard title(longest).hasPrefix("60 с"), title(middle).hasPrefix("14 с"), title(shortest).hasPrefix("12 с") else {
            throw LiveFailure("The boundaries do not show the gaps between the displayed entries")
        }
        let choiceList = try driver.element("calls.split.choices")
        let displayed = descendants(choiceList).reversed().map { string($0, kAXIdentifierAttribute) }
            .filter { $0.hasPrefix("calls.split.choice.") }
        guard displayed == ["calls.split.choice.75", "calls.split.choice.89", "calls.split.choice.15"] else {
            throw LiveFailure("Unexpected order of the available gaps: \(displayed)")
        }

        for field in ["calls.split.first", "calls.split.second"] {
            _ = try driver.element(field, value: { $0 == originalTitle })
            try edit(field, "Discarded change", driver)
        }
        try driver.press("calls.split.cancel")
        try driver.absent("calls.split.sheet")
        try row(first, title: originalTitle, duration: "2:00", driver)

        try openSplit(driver)
        try driver.press("calls.split.choice.15")
        try driver.press("calls.split.choice.75")
        try edit("calls.split.first", firstTitle, driver)
        try edit("calls.split.second", secondTitle, driver)
        AXUIElementSetAttributeValue(try driver.element("calls.split.first"), kAXFocusedAttribute as CFString, kCFBooleanTrue)
        try driver.screenshot("choosing-split", into: output)
        try driver.press("calls.split.confirm")
        try driver.absent("calls.split.sheet")
        // Part 1's row shows its notes wait until they are made; read both rows after.
        _ = try driver.element("calls.select.\(first)")
        _ = try driver.element("calls.select.\(second)")
        _ = try driver.element("preview.making")
        _ = try driver.element("calls.split", value: { $0.contains("закончил расшифровку и итоги") })
        _ = try driver.element("preview.tag.fixture")
        try driver.screenshot("split-notes-pending", into: output)

        for index in 1...2 { try finishNotes(index, control: control) }
        try row(first, title: firstTitle, duration: "1:15", driver)
        try row(second, title: secondTitle, duration: "0:45", driver)
        // The sheet leaves part 1 selected even though its ID is the original one.
        _ = try driver.element("preview.notes", value: { $0.contains(firstWords) && !$0.contains(secondWords) })
        try inspectPart(first, title: firstTitle, words: firstWords, other: secondWords, speaker: "Анна",
                        time: "00:00:03", duration: 75, levels: [0.125, 0.375], driver, calls, output)
        try inspectPart(second, title: secondTitle, words: secondWords, other: firstWords, speaker: "Борис",
                        time: "00:00:00", duration: 45, levels: [0.25, 0.5], driver, calls, output)

        // Notes and the row can become visible just before the idle offer changes.
        _ = try driver.element("calls.split", value: { $0 == "Разделить звонок…" })
        try driver.pressMergeControl()
        try driver.mark(first, true)
        try driver.mark(second, true)
        try driver.press("calls.merge.confirm")
        try driver.absent("calls.select.\(second)")
        let folder = try folder(for: first, in: calls)
        let joined = try read("transcript.md", in: folder)
        guard joined.contains("**Gap** 00:01:15\nCut off for 00:00:00"),
              joined.contains("00:00:03\n\(firstWords)"),
              joined.contains("00:01:15\n\(secondWords)"),
              joined.contains("00:01:29\nРелиз готов к проверке.") else {
            throw LiveFailure("The merged transcript did not restore the timeline and cut marker: \(joined)")
        }
        try joined.write(to: output.appendingPathComponent("merged-transcript.md"), atomically: true, encoding: .utf8)
        try finishNotes(3, control: control)
        _ = try driver.element("preview.notes", value: { $0.contains(firstWords) && $0.contains(secondWords) })
        try driver.screenshot("merged-back", into: output)
    }

    @MainActor private static func openSplit(_ driver: Driver) throws {
        _ = try driver.element("calls.split", value: { $0 == "Разделить звонок…" })
        try driver.pressSplitControl()
        _ = try driver.element("calls.split.confirm")
    }

    /// Types a title the way a person does: focus the field, then replace its text. The binding sees the
    /// change while the field is editing; a value set on an unfocused field never reaches it.
    @MainActor private static func edit(_ id: String, _ value: String, _ driver: Driver) throws {
        AXUIElementSetAttributeValue(try driver.element(id), kAXFocusedAttribute as CFString, kCFBooleanTrue)
        _ = try driver.wait("focus on \(id)") { () -> Bool? in
            guard let field = try? driver.element(id) else { return nil }
            var focused: CFTypeRef?
            AXUIElementCopyAttributeValue(field, kAXFocusedAttribute as CFString, &focused)
            return (focused as? Bool) == true ? true : nil
        }
        let result = AXUIElementSetAttributeValue(try driver.element(id), kAXValueAttribute as CFString, value as CFString)
        guard result == .success else { throw LiveFailure("Editing \(id) failed: \(result.rawValue)") }
        _ = try driver.element(id, value: { $0 == value })
    }

    @MainActor private static func row(_ id: String, title expected: String, duration: String, _ driver: Driver) throws {
        let row = try driver.element("calls.select.\(id)", value: { $0 == "\(duration), #fixture" })
        guard title(row) == expected else { throw LiveFailure("Expected \(expected) at \(id), found \(title(row))") }
    }

    private static func title(_ element: AXUIElement) -> String {
        let title = string(element, kAXTitleAttribute)
        return title.isEmpty ? string(element, kAXDescriptionAttribute) : title
    }

    private static func finishNotes(_ index: Int, control: URL) throws {
        try "echo-transcript".write(to: control.appendingPathComponent("finish-\(index)"), atomically: true, encoding: .utf8)
    }

    @MainActor private static func inspectPart(_ id: String, title expected: String, words: String, other: String,
                                               speaker: String, time: String, duration: Double, levels: [Float],
                                               _ driver: Driver, _ calls: URL, _ output: URL) throws {
        try driver.press("calls.select.\(id)")
        _ = try driver.element("preview.tag.fixture")
        _ = try driver.element("preview.notes", value: { $0.contains(words) && !$0.contains(other) })
        let part = try folder(for: id, in: calls)
        let transcript = try read("transcript.md", in: part)
        guard transcript.contains("\(time)\n\(words)"), transcript.contains(speaker), !transcript.contains(other),
              !transcript.contains(id == first ? "Борис" : "Анна"),
              part.lastPathComponent == "\(id) \(expected)",
              try read("tags.txt", in: part) == "fixture\n" else {
            throw LiveFailure("The reopened part \(id) has the wrong transcript, speakers, title or tags")
        }
        let notes = try read("summary.md", in: part)
        guard notes.contains(words), !notes.contains(other), !notes.contains("Предыдущие итоги") else {
            throw LiveFailure("The notes for \(id) were not remade from its own transcript")
        }
        let recordings = try FileManager.default.contentsOfDirectory(at: part, includingPropertiesForKeys: nil)
            .filter { $0.lastPathComponent.hasPrefix(id) }
        guard recordings.count == 1, let recording = recordings.first else { throw LiveFailure("Missing split audio folder") }
        for (name, level) in zip(["call.caf", "microphone.caf"], levels) {
            try checkTrack(recording.appendingPathComponent(name), duration: duration, level: level)
        }
        try transcript.write(to: output.appendingPathComponent("\(id)-transcript.md"), atomically: true, encoding: .utf8)
        try driver.screenshot(id, into: output)
    }

    private static func folder(for id: String, in calls: URL) throws -> URL {
        let matches = try FileManager.default.contentsOfDirectory(at: calls, includingPropertiesForKeys: nil).filter {
            $0.lastPathComponent == id || $0.lastPathComponent.hasPrefix(id + " ")
        }
        guard matches.count == 1, let folder = matches.first else { throw LiveFailure("Could not reopen \(id): \(matches)") }
        return folder
    }

    private static func read(_ name: String, in folder: URL) throws -> String {
        try String(contentsOf: folder.appendingPathComponent(name), encoding: .utf8)
    }

    private static func checkTrack(_ url: URL, duration: Double, level: Float) throws {
        let audio = try AVAudioFile(forReading: url)
        let rate = audio.processingFormat.sampleRate
        guard rate == 48_000, audio.length == Int64(rate * duration),
              let buffer = AVAudioPCMBuffer(pcmFormat: audio.processingFormat, frameCapacity: 1) else {
            throw LiveFailure("Wrong length or format in \(url.path)")
        }
        for position in [0, audio.length - 1] {
            audio.framePosition = position
            try audio.read(into: buffer, frameCount: 1)
            guard buffer.frameLength == 1, let sample = buffer.floatChannelData?[0][0], abs(sample - level) < 0.001 else {
                throw LiveFailure("Wrong sample at frame \(position) in \(url.path)")
            }
        }
    }
}
