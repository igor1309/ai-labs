import Foundation
import Preferences
import SettingsUI
import Testing
@testable import Composer

/// Settings → General's AGENTS.md row against a temporary recordings root (docs/spec/agents-file).
@MainActor @Suite(.timeLimit(.minutes(1)))
struct AgentsFileWiringTests {

    @Test func theRowIsOfferedCreatesTheFileAndComesBackAfterADelete() async throws {
        try await withComposeFolder { root in
            let rig = try await ComposeFixture.make(root: root)
            let file = root.appendingPathComponent("AGENTS.md")
            #expect(rig.menu.settingsState.general.agents == .init(hint: rig.menu.settingsText(.agentsHint)))
            #expect(!FileManager.default.fileExists(atPath: file.path))
            await rig.menu.sendSettings(.createAgentsFile)
            #expect(FileManager.default.fileExists(atPath: file.path))
            #expect(rig.menu.settingsState.general.agents == nil)
            try FileManager.default.removeItem(at: file)
            #expect(rig.menu.settingsState.general.agents != nil)
            await rig.finish()
        }
    }

    @Test func noOtherSettingsEventWritesTheFile() async throws {
        try await withComposeFolder { root in
            let rig = try await ComposeFixture.make(root: root)
            let file = root.appendingPathComponent("AGENTS.md")
            var events: [SettingsEvent] = SettingsState.Tab.allCases.map { .selectTab($0) }
            events += SettingsState.General.Language.allCases.map { .selectLanguage($0) }
            events += SettingsState.General.Appearance.allCases.map { .selectAppearance($0) }
            events += [.setAutomaticNotes(true), .setAutomaticNotes(false), .setIdentifySpeakers(true), .setIdentifySpeakers(false),
                       .setLiveText(false), .setLiveText(true), .setRecordsCalls(true), .setRecordsCalls(false), .selectTab(.general)]
            for event in events {
                await rig.menu.sendSettings(event)
                _ = rig.menu.settingsState
                #expect(!FileManager.default.fileExists(atPath: file.path), "\(event)")
            }
            #expect(rig.menu.settingsState.general.agents != nil)
            await rig.finish()
        }
    }

    @Test func theUsersOwnFileHidesTheRowAndIsKept()async throws {
        try await withComposeFolder { root in
            let file = root.appendingPathComponent("AGENTS.md")
            try Data("mine".utf8).write(to: file)
            let rig = try await ComposeFixture.make(root: root)
            #expect(rig.menu.settingsState.general.agents == nil)
            await rig.menu.sendSettings(.createAgentsFile)
            #expect(try String(contentsOf: file, encoding: .utf8) == "mine")
            await rig.finish()
        }
    }

    @Test func aFailedWriteSaysWhyAndARetryHidesTheRow() async throws {
        try await withComposeFolder { parent in
            let root = parent.appendingPathComponent("calls")
            try FileManager.default.createDirectory(at: root, withIntermediateDirectories: true)
            let rig = try await ComposeFixture.make(root: parent, preferences: Preferences(automaticRecording: false, liveText: true, callsFolder: root))
            try FileManager.default.setAttributes([.posixPermissions: 0o500], ofItemAtPath: root.path)
            defer { try? FileManager.default.setAttributes([.posixPermissions: 0o700], ofItemAtPath: root.path) }
            await rig.menu.sendSettings(.createAgentsFile)
            let hint = try #require(rig.menu.settingsState.general.agents?.hint)
            #expect(hint.hasPrefix(rig.menu.settingsText(.agentsFailed, "")))
            #expect(hint != rig.menu.settingsText(.agentsFailed, ""))
            #expect(rig.log.entries.all.contains { $0.message == "AGENTS.md write failed" })
            try FileManager.default.setAttributes([.posixPermissions: 0o700], ofItemAtPath: root.path)
            await rig.menu.sendSettings(.createAgentsFile)
            #expect(rig.menu.settingsState.general.agents == nil)
            await rig.finish()
        }
    }

    @Test func noRowWithoutARecordingsRoot() async throws {
        try await withComposeFolder { parent in
            let root = parent.appendingPathComponent("gone")
            let rig = try await ComposeFixture.make(root: parent, preferences: Preferences(automaticRecording: false, liveText: true, callsFolder: root))
            #expect(rig.menu.settingsState.general.agents == nil)
            #expect(!FileManager.default.fileExists(atPath: root.appendingPathComponent("AGENTS.md").path))
            await rig.finish()
        }
    }
}
