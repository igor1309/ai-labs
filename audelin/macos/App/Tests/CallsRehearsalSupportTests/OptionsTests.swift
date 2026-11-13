import CallsRehearsalSupport
import Foundation
import Preferences
import Testing

struct OptionsTests {
    @Test(arguments: [
        [], ["--calls"], ["--state", "/tmp/state"], ["--calls", "/tmp/calls"],
        ["--calls", "relative", "--state", "/tmp/state"],
        ["--calls", "/tmp/calls", "--state", "relative"],
        ["--calls", "", "--state", "/tmp/state"],
        ["--calls", "/tmp/calls", "--state", ""],
        ["--calls=/tmp/calls", "--state=/tmp/state"],
        ["--calls", "/tmp/one", "--calls", "/tmp/two"],
        ["--state", "/tmp/one", "--state", "/tmp/two"],
        ["--unknown", "/tmp/calls", "--state", "/tmp/state"],
        ["--calls", "/tmp/calls", "--state", "/tmp/state", "extra"],
        ["--calls", "/tmp/ca\0lls", "--state", "/tmp/state"],
        ["--calls", "/tmp/calls", "--state", "/tmp/sta\0te"],
    ]) func malformedArgumentsFail(arguments: [String]) {
        #expect(throws: CallsRehearsalOptions.Failure.self) { try CallsRehearsalOptions.parse(arguments) }
    }

    @Test(arguments: [false, true]) func acceptsEitherOrder(reversed: Bool) throws {
        let arguments = reversed
            ? ["--state", "/tmp/state space", "--calls", "/tmp/calls space"]
            : ["--calls", "/tmp/calls space", "--state", "/tmp/state space"]
        let options = try CallsRehearsalOptions.parse(arguments)
        #expect(options.callsFolder.path == "/tmp/calls space")
        #expect(options.stateFolder.path == "/tmp/state space")
        #expect(options.preferencesURL.path == "/tmp/state space/preferences.json")
        #expect(options.controlFolder.path == "/tmp/state space/control")
    }

    @Test func writesIsolatedPreferencesBeforeComposition() async throws {
        try await withRehearsalFolder { root in
            let calls = root.appendingPathComponent("calls", isDirectory: true)
            let state = root.appendingPathComponent("state", isDirectory: true)
            let options = try CallsRehearsalOptions.parse(["--calls", calls.path, "--state", state.path])
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
            let options = try CallsRehearsalOptions.parse(["--calls", root.appendingPathComponent("calls").path, "--state", root.path])
            try PreferencesStore(fileURL: options.preferencesURL).write(Preferences(notes: .init(enabled: true), automaticRecording: true, liveText: true))
            try options.prepare()
            let stored = PreferencesStore(fileURL: options.preferencesURL).read()
            #expect(stored.callsFolder == options.callsFolder)
            #expect(!stored.automaticRecording && !stored.liveText && !stored.notes.enabled)
        }
    }
}
