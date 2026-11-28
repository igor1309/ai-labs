import AppKit
import ApplicationServices

/// The calls `CallsRehearsal --seed merge` writes: A and B, one call cut off, with transcripts
/// and notes; C, whose transcript failed; D, with a transcript and no notes.
private let a = "2024.01.01-1000", b = "2024.01.01-1006", c = "2024.01.01-1012", d = "2024.01.01-1030"
private let busy = "Audelin занят; объедините звонки, когда он освободится."
private let needsTwo = "Отметьте хотя бы два звонка"

private struct Fixture {
    let calls: URL, state: URL, control: URL, trash: URL, output: URL
    func files(_ path: String = "") throws -> [String] {
        try FileManager.default.contentsOfDirectory(atPath: calls.appendingPathComponent(path).path)
            .filter { !$0.hasPrefix(".") }.sorted()
    }
}

@main private enum CallsMergeLive {
    @MainActor static func main() async {
        var output: URL?
        do {
            guard CommandLine.arguments.count == 2 else { throw LiveFailure("Usage: calls-merge <CallsRehearsal executable>") }
            guard AXIsProcessTrusted() else { throw LiveFailure("The live driver needs Accessibility access in this logged-in session.") }
            let app = URL(fileURLWithPath: CommandLine.arguments[1]).standardizedFileURL
            let root = FileManager.default.temporaryDirectory.appendingPathComponent("audelin-merge-live-\(UUID())")
            output = root
            try FileManager.default.createDirectory(at: root, withIntermediateDirectories: true)
            print("Artifacts: \(root.path)")
            try launch(app: app, root: root, name: "refused", run: refusing)
            try launch(app: app, root: root, name: "merge", run: merging)
            try launch(app: app, root: root, name: "far-apart", run: farApart)
            try launch(app: app, root: root, name: "failure", run: failing)
            try launch(app: app, root: root, name: "busy", run: refusingWhileBusy)
            try launch(app: app, root: root, name: "recovered", seed: "interrupted-merge", run: recovering)
            try launch(app: app, root: root, name: "legacy-origin", seed: "legacy-merge", run: legacyMergeOrigins)
            removeFixtures(root)
            print("PASS: refusing a call without a transcript, merging a cut call with its notes, each original call's origin through a remerge, the far-apart warning, a failed merge, refusing while busy, recovering an interrupted merge and a merge made before origins")
        } catch {
            fputs("FAIL: \(error)\n", stderr)
            if let output { removeFixtures(output) }
            exit(1)
        }
    }

    /// Keeps the screenshots and the merged transcript, and removes each scenario's seeded folder.
    private static func removeFixtures(_ root: URL) {
        for name in (try? FileManager.default.contentsOfDirectory(atPath: root.path)) ?? [] {
            let url = root.appendingPathComponent(name)
            guard (try? url.resourceValues(forKeys: [.isDirectoryKey]))?.isDirectory == true else { continue }
            try? FileManager.default.setAttributes([.posixPermissions: 0o755], ofItemAtPath: url.appendingPathComponent("calls").path)
            try? FileManager.default.removeItem(at: url)
        }
    }

    /// Launches the rehearsal on a fresh seeded folder, runs one scenario and quits it.
    @MainActor private static func launch(app: URL, root: URL, name: String, seed: String = "merge",
                                          run: (Driver, Fixture) throws -> Void) throws {
        let folder = root.appendingPathComponent(name)
        let fixture = Fixture(calls: folder.appendingPathComponent("calls"), state: folder.appendingPathComponent("state"),
                              control: folder.appendingPathComponent("state/control"), trash: folder.appendingPathComponent("trash"),
                              output: root)
        for made in [fixture.calls, fixture.control] { try FileManager.default.createDirectory(at: made, withIntermediateDirectories: true) }
        let application = Process()
        application.executableURL = app
        application.arguments = ["--calls", fixture.calls.path, "--state", fixture.state.path, "--trash", fixture.trash.path, "--seed", seed]
        defer {
            try? FileManager.default.setAttributes([.posixPermissions: 0o755], ofItemAtPath: fixture.calls.path)
            if application.isRunning { application.terminate() }
        }
        try application.run()
        let driver = try Driver(process: application, folders: [fixture.calls, fixture.control])
        defer { driver.stop() }
        do { try run(driver, fixture) }
        catch {
            try? driver.screenshot("\(name)-failure", into: root)
            throw error
        }
        application.terminate()
        _ = try driver.wait("app termination") { application.isRunning ? nil : true }
        guard !FileManager.default.fileExists(atPath: fixture.calls.appendingPathComponent("AGENTS.md").path) else { throw LiveFailure("AGENTS.md appeared in the calls folder; only the Settings button may write it") }
    }

    /// One marked call: Merge is disabled and says why. A call whose transcript failed is
    /// refused when the merge is confirmed: the window reads why and every call stays.
    @MainActor private static func refusing(_ driver: Driver, _ fixture: Fixture) throws {
        _ = try driver.element("calls.select.\(d)")
        try driver.pressMergeControl()
        try driver.mark(b, true)
        _ = try driver.element("calls.merge.confirm", value: { $0 == needsTwo })
        try driver.mark(c, true)
        _ = try driver.element("calls.merge.confirm", value: { $0.isEmpty })
        try driver.screenshot("refused-marked", into: fixture.output)
        try driver.press("calls.merge.confirm")
        _ = try driver.element("calls.failure", value: { $0.contains("«\(c)»") })
        _ = try driver.element("calls.select.\(b)", value: { $0.hasSuffix(", Отмечен") })
        _ = try driver.element("calls.select.\(c)", value: { $0.hasSuffix(", Отмечен") })
        try driver.screenshot("refused", into: fixture.output)
        guard try fixture.files() == [a, b, c, d] else { throw LiveFailure("After a refused merge the folder holds \(try fixture.files())") }
    }

    /// A and B merge into one call at A's start: the transcript holds A, the gap, then B with
    /// each part's speakers kept apart; the parts are kept whole inside it; its notes are made.
    @MainActor private static func merging(_ driver: Driver, _ fixture: Fixture) throws {
        _ = try driver.element("calls.select.\(d)")
        try driver.pressMergeControl()
        try driver.mark(a, true)
        try driver.mark(b, true)
        try driver.screenshot("merge-marked", into: fixture.output)
        try driver.press("calls.merge.confirm")
        try driver.absent("calls.select.\(b)")
        let merged = fixture.calls.appendingPathComponent(a)
        _ = try driver.wait("the merged folder") {
            FileManager.default.fileExists(atPath: merged.appendingPathComponent(b).path) ? true : nil
        }
        guard try fixture.files() == [a, c, d] else { throw LiveFailure("After the merge the folder holds \(try fixture.files())") }
        guard try fixture.files(a) == [a, b, "transcript.md"] else {
            throw LiveFailure("The merged call holds \(try fixture.files(a))")
        }
        for part in [a, b] where try fixture.files("\(a)/\(part)") != ["call.caf", "summary.md", "transcript.md"] {
            throw LiveFailure("Part \(part) holds \(try fixture.files("\(a)/\(part)"))")
        }
        let transcript = try String(contentsOf: merged.appendingPathComponent("transcript.md"), encoding: .utf8)
        try transcript.write(to: fixture.output.appendingPathComponent("merged-transcript.md"), atomically: true, encoding: .utf8)
        try checkJoined(transcript)
        try checkOrigins(transcript, versions: ["fixture-a", "fixture-b"], ids: [a, b])
        // A merged call's length is its span, from A's start to B's end.
        _ = try driver.element("calls.select.\(a)", value: { $0.hasPrefix("6:10") })
        guard !FileManager.default.fileExists(atPath: fixture.trash.path) else { throw LiveFailure("A merge moved something to the Trash") }
        try driver.screenshot("merged", into: fixture.output)
        // Notes are off in the rehearsal, so the merged call offers its notes as an ended call does.
        try driver.press("preview.make")
        _ = try driver.wait("the merged call's notes started") {
            FileManager.default.fileExists(atPath: fixture.control.appendingPathComponent("started-1").path) ? true : nil
        }
        try Data().write(to: fixture.control.appendingPathComponent("finish-1"))
        _ = try driver.element("preview.notes", value: { $0.contains("Обсудили выпуск Audelin.") })
        let notes = try String(contentsOf: merged.appendingPathComponent("summary.md"), encoding: .utf8)
        guard notes.contains("Обсудили выпуск Audelin.") else { throw LiveFailure("Merged notes:\n\(notes)") }
        try driver.screenshot("merged-notes", into: fixture.output)
        try remergeWithLegacyCall(driver, fixture)

    }

    /// The remerge lists A and B once, and the old call D explicitly unknown.
    @MainActor private static func remergeWithLegacyCall(_ driver: Driver, _ fixture: Fixture) throws {
        try driver.pressMergeControl()
        try driver.mark(a, true); try driver.mark(d, true)
        try driver.press("calls.merge.confirm")
        try driver.press("calls.merge.anyway")
        try driver.absent("calls.select.\(d)")
        let url = fixture.calls.appendingPathComponent("\(a)/transcript.md")
        _ = try driver.wait("remerge saved") { FileManager.default.fileExists(atPath: fixture.calls.appendingPathComponent("\(a)/\(d)").path) ? true : nil }
        try checkOrigins(String(contentsOf: url, encoding: .utf8), versions: ["fixture-a", "fixture-b", nil], ids: [a, b, d])
        try driver.screenshot("remerged-origins", into: fixture.output)
    }

    /// A legacy merge contributes its original starts, each explicitly unknown.
    @MainActor private static func legacyMergeOrigins(_ driver: Driver, _ fixture: Fixture) throws {
        _ = try driver.element("calls.select.\(d)")
        try driver.pressMergeControl(); try driver.mark(a, true); try driver.mark(d, true)
        try driver.press("calls.merge.confirm"); try driver.press("calls.merge.anyway")
        try driver.absent("calls.select.\(d)")
        _ = try driver.wait("legacy remerge saved") { FileManager.default.fileExists(atPath: fixture.calls.appendingPathComponent("\(a)/\(d)").path) ? true : nil }
        try checkOrigins(String(contentsOf: fixture.calls.appendingPathComponent("\(a)/transcript.md"), encoding: .utf8),
                         versions: [nil, nil, nil], ids: [a, b, d])
        try driver.screenshot("legacy-remerged-origins", into: fixture.output)
    }

    private static func checkOrigins(_ transcript: String, versions: [String?], ids: [String]) throws {
        let blocks = transcript.components(separatedBy: "\n---\n")
        guard transcript.hasPrefix("---\n"), let header = blocks.first,
              let block = try JSONSerialization.jsonObject(with: Data(header.dropFirst(4).utf8)) as? [String: Any],
              let origin = block["origin"] as? [String: Any],
              let calls = origin["calls"] as? [[String: Any]], calls.count == versions.count,
              let mergedBy = origin["mergedBy"] as? [String: String], mergedBy == ["version": "rehearsal", "build": "1"] else {
            throw LiveFailure("Missing original calls or merging release: \(transcript)")
        }
        let date = DateFormatter()
        date.locale = Locale(identifier: "en_US_POSIX"); date.timeZone = .current; date.dateFormat = "yyyy.MM.dd-HHmm"
        for (index, call) in calls.enumerated() {
            guard let start = call["start"] as? Double, start == date.date(from: ids[index])?.timeIntervalSince1970 else {
                throw LiveFailure("Original starts are missing, duplicated or out of order")
            }
            if let expected = versions[index] {
                guard let value = call["origin"] as? [String: Any], let hearing = value["hearing"] as? [String: String],
                      hearing == ["version": expected, "build": "fixture-build"],
                      value["mine"] as? String == "fixture-mine", value["theirs"] as? String == "fixture-theirs" else {
                    throw LiveFailure("Wrong original origin at \(ids[index])")
                }
            } else if !(call["origin"] is NSNull) { throw LiveFailure("Legacy original must be explicitly unknown") }
        }
    }

    /// A's rows, a gap row, then B's rows, with no remote label shared between the parts.
    private static func checkJoined(_ transcript: String) throws {
        let order = ["Часть один.", "Ответ один.", "**Gap**", "Часть два.", "Ответ два."]
        let places = order.map { transcript.range(of: $0)?.lowerBound }
        guard places.allSatisfy({ $0 != nil }), zip(places, places.dropFirst()).allSatisfy({ $0! < $1! }) else {
            throw LiveFailure("Merged transcript out of order:\n\(transcript)")
        }
        /// The remote label heading the row with these words, such as `Them 2`.
        func label(before words: String) -> String? {
            guard let end = transcript.range(of: words)?.lowerBound,
                  let open = transcript[..<end].range(of: "**Them", options: .backwards),
                  let close = transcript[open.upperBound..<end].range(of: "**") else { return nil }
            return String(transcript[transcript.index(open.lowerBound, offsetBy: 2)..<close.lowerBound])
        }
        guard let first = label(before: "Ответ один."), let second = label(before: "Ответ два."), first != second else {
            throw LiveFailure("The parts' speakers share a label:\n\(transcript)")
        }
    }

    /// Calls with another between them ask again; going back keeps the marks; merging anyway merges.
    @MainActor private static func farApart(_ driver: Driver, _ fixture: Fixture) throws {
        _ = try driver.element("calls.select.\(d)")
        try driver.pressMergeControl()
        try driver.mark(a, true)
        try driver.mark(d, true)
        try driver.press("calls.merge.confirm")
        _ = try driver.element("calls.merge.anyway")
        try driver.screenshot("merge-warning", into: fixture.output)
        try driver.press("calls.merge.back")
        try driver.absent("calls.merge.anyway")
        _ = try driver.element("calls.select.\(a)", value: { $0.hasSuffix(", Отмечен") })
        _ = try driver.element("calls.select.\(d)", value: { $0.hasSuffix(", Отмечен") })
        _ = try driver.element("calls.select.\(b)", value: { $0.hasSuffix(", Не отмечен") })
        try driver.press("calls.merge.confirm")
        try driver.press("calls.merge.anyway")
        try driver.absent("calls.select.\(d)")
        _ = try driver.wait("the merged-anyway folder") {
            FileManager.default.fileExists(atPath: fixture.calls.appendingPathComponent("\(a)/\(d)").path) ? true : nil
        }
        _ = try driver.element("calls.select.\(b)")
        try driver.screenshot("merged-anyway", into: fixture.output)
    }

    /// With the calls folder read-only, the merge fails, says why, and both parts stay.
    @MainActor private static func failing(_ driver: Driver, _ fixture: Fixture) throws {
        _ = try driver.element("calls.select.\(d)")
        try driver.pressMergeControl()
        try driver.mark(a, true)
        try driver.mark(b, true)
        try FileManager.default.setAttributes([.posixPermissions: 0o555], ofItemAtPath: fixture.calls.path)
        try driver.press("calls.merge.confirm")
        _ = try driver.element("calls.failure", value: { !$0.isEmpty })
        try driver.screenshot("merge-failed", into: fixture.output)
        try FileManager.default.setAttributes([.posixPermissions: 0o755], ofItemAtPath: fixture.calls.path)
        guard try fixture.files() == [a, b, c, d] else { throw LiveFailure("After a failed merge the folder holds \(try fixture.files())") }
        _ = try driver.element("calls.select.\(a)")
        _ = try driver.element("calls.select.\(b)")
    }

    /// While D's notes are being made, merge mode reads why it is not available and is not entered.
    @MainActor private static func refusingWhileBusy(_ driver: Driver, _ fixture: Fixture) throws {
        try driver.press("calls.select.\(d)")
        try driver.press("preview.make")
        _ = try driver.wait("D's notes started") {
            FileManager.default.fileExists(atPath: fixture.control.appendingPathComponent("started-1").path) ? true : nil
        }
        _ = try driver.element("preview.making")
        try driver.pressMergeControl()
        _ = try driver.element("calls.failure", value: { $0 == busy })
        try driver.absent("calls.merge.confirm")
        try driver.screenshot("busy", into: fixture.output)
        try Data().write(to: fixture.control.appendingPathComponent("finish-1"))
        _ = try driver.element("preview.notes", value: { $0.contains("Обсудили выпуск Audelin.") })
        try driver.pressMergeControl()
        _ = try driver.element("calls.merge.confirm")
        try driver.screenshot("idle-again", into: fixture.output)
    }

    /// A merge a crash interrupted is put back whole on launch: B returns, the prepared folder goes.
    @MainActor private static func recovering(_ driver: Driver, _ fixture: Fixture) throws {
        for id in [a, b, c, d] { _ = try driver.element("calls.select.\(id)") }
        let left = try FileManager.default.contentsOfDirectory(atPath: fixture.calls.path).sorted()
        guard left == [a, b, c, d] else { throw LiveFailure("After recovery the folder holds \(left)") }
        guard try fixture.files(b) == ["call.caf", "summary.md", "transcript.md"] else {
            throw LiveFailure("B came back holding \(try fixture.files(b))")
        }
        try driver.screenshot("recovered", into: fixture.output)
    }
}
