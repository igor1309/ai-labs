import CallsRehearsalSupport
import Foundation
import Preferences
import Testing

struct OptionsTests {
    @Test(arguments: [
        [], ["--calls"], ["--state", "/tmp/state"], ["--calls", "/tmp/calls"],
        ["--calls", "/tmp/calls", "--state", "/tmp/state"],
        ["--calls", "relative", "--state", "/tmp/state", "--trash", "/tmp/trash"],
        ["--calls", "/tmp/calls", "--state", "relative", "--trash", "/tmp/trash"],
        ["--calls", "/tmp/calls", "--state", "/tmp/state", "--trash", "relative"],
        ["--calls", "", "--state", "/tmp/state", "--trash", "/tmp/trash"],
        ["--calls", "/tmp/calls", "--state", "", "--trash", "/tmp/trash"],
        ["--calls", "/tmp/calls", "--state", "/tmp/state", "--trash", ""],
        ["--calls=/tmp/calls", "--state=/tmp/state", "--trash=/tmp/trash"],
        ["--calls", "/tmp/one", "--calls", "/tmp/two", "--trash", "/tmp/trash"],
        ["--state", "/tmp/one", "--state", "/tmp/two", "--trash", "/tmp/trash"],
        ["--trash", "/tmp/one", "--trash", "/tmp/two", "--calls", "/tmp/calls"],
        ["--unknown", "/tmp/calls", "--state", "/tmp/state", "--trash", "/tmp/trash"],
        ["--calls", "/tmp/calls", "--state", "/tmp/state", "--trash", "/tmp/trash", "extra"],
        ["--calls", "/tmp/ca\0lls", "--state", "/tmp/state", "--trash", "/tmp/trash"],
        ["--calls", "/tmp/calls", "--state", "/tmp/sta\0te", "--trash", "/tmp/trash"],
        ["--calls", "/tmp/calls", "--state", "/tmp/state", "--trash", "/tmp/tra\0sh"],
    ]) func malformedArgumentsFail(arguments: [String]) {
        #expect(throws: CallsRehearsalOptions.Failure.self) { try CallsRehearsalOptions.parse(arguments) }
    }

    @Test(arguments: [false, true]) func acceptsEitherOrder(reversed: Bool) throws {
        let arguments = reversed
            ? ["--trash", "/tmp/trash space", "--state", "/tmp/state space", "--calls", "/tmp/calls space"]
            : ["--calls", "/tmp/calls space", "--state", "/tmp/state space", "--trash", "/tmp/trash space"]
        let options = try CallsRehearsalOptions.parse(arguments)
        #expect(options.callsFolder.path == "/tmp/calls space")
        #expect(options.stateFolder.path == "/tmp/state space")
        #expect(options.trashFolder.path == "/tmp/trash space")
        #expect(options.preferencesURL.path == "/tmp/state space/preferences.json")
        #expect(options.controlFolder.path == "/tmp/state space/control")
    }

    @Test func writesIsolatedPreferencesBeforeComposition() async throws {
        try await withRehearsalFolder { root in
            let calls = root.appendingPathComponent("calls", isDirectory: true)
            let state = root.appendingPathComponent("state", isDirectory: true)
            let options = try CallsRehearsalOptions.parse(["--calls", calls.path, "--state", state.path, "--trash", root.appendingPathComponent("trash").path])
            try options.prepare()
            let stored = try JSONDecoder().decode(Preferences.self, from: Data(contentsOf: options.preferencesURL))
            #expect(stored.callsFolder == calls)
            #expect(!stored.automaticRecording && !stored.liveText)
            #expect(!stored.notes.enabled && !stored.notes.speakers)
            #expect(stored.notes.primary == .init(kind: "compatibleAPI", model: "calls-rehearsal", executable: "",
                                                 endpoint: "http://127.0.0.1:1", credentialVariable: ""))
            #expect(stored.notes.fallback == nil)
            #expect(stored.language == .russian && stored.appearance == .light)
            #expect(FileManager.default.fileExists(atPath: options.controlFolder.path))
        }
    }

    @Test func preparesExistingPreferencesWithAutomaticWorkDisabled() async throws {
        try await withRehearsalFolder { root in
            let options = try CallsRehearsalOptions.parse(["--calls", root.appendingPathComponent("calls").path, "--state", root.path, "--trash", root.appendingPathComponent("trash").path])
            try PreferencesStore(fileURL: options.preferencesURL).write(Preferences(notes: .init(enabled: true), automaticRecording: true, liveText: true))
            try options.prepare()
            let stored = PreferencesStore(fileURL: options.preferencesURL).read()
            #expect(stored.callsFolder == options.callsFolder)
            #expect(!stored.automaticRecording && !stored.liveText && !stored.notes.enabled)
        }
    }

    @Test func trashMovesItemsIntoTheTrashFolderKeepingEarlierOnes() async throws {
        try await withRehearsalFolder { root in
            let calls = root.appendingPathComponent("calls"), trash = root.appendingPathComponent("trash")
            let options = try CallsRehearsalOptions.parse(["--calls", calls.path, "--state", root.appendingPathComponent("state").path, "--trash", trash.path])
            for content in ["first", "second"] {
                let call = calls.appendingPathComponent("2024.01.01-1000")
                try FileManager.default.createDirectory(at: call, withIntermediateDirectories: true)
                try content.write(to: call.appendingPathComponent("transcript.md"), atomically: true, encoding: .utf8)
                try options.trash(call)
                #expect(!FileManager.default.fileExists(atPath: call.path))
            }
            let first = try String(contentsOf: trash.appendingPathComponent("2024.01.01-1000/transcript.md"), encoding: .utf8)
            let second = try String(contentsOf: trash.appendingPathComponent("2024.01.01-1000 2/transcript.md"), encoding: .utf8)
            #expect(first == "first" && second == "second")
        }
    }
}
