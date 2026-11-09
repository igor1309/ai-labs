import Foundation
import SettingsUI
import Testing
@testable import Composer

@MainActor @Suite(.timeLimit(.minutes(1)))
struct FolderPickerFailureTests {

    @Test func aPickerThatNeverAppearsEndsTheWaitWithAnError() async throws {
        await #expect(throws: FolderPickerDidNotOpen.self) {
            _ = try await presentPicker(begin: { _ in }, isVisible: { false }, sleep: { _ in })
        }
    }

    @Test func aVisiblePickerIsWaitedOnUntilItAnswers() async throws {
        let destination = URL(fileURLWithPath: "/tmp/picked")
        var answer: (@MainActor (URL?) -> Void)?
        let picked = Task { try await presentPicker(begin: { answer = $0 }, isVisible: { true }, sleep: { _ in }) }
        while answer == nil { await Task.yield() }
        for _ in 0..<20 { await Task.yield() }
        answer?(destination)
        #expect(try await picked.value == destination)
    }

    @Test func aFailedPickerIsLoggedShownInSettingsAndCanBeTriedAgain() async throws {
        try await withComposeFolder { root in
            let rig = try await ComposeFixture.make(root: root)
            var picks = 0
            rig.menu.installFolderPicker { picks += 1; throw FolderPickerDidNotOpen() }
            await rig.menu.sendSettings(.changeFolder)
            guard case .pickerFailed = rig.menu.settingsState.folder.status else {
                Issue.record("status \(rig.menu.settingsState.folder.status)"); await rig.finish(); return
            }
            #expect(rig.log.entries.all.contains { $0.message == "folder picker requested" })
            #expect(rig.log.entries.all.contains {
                $0.message == "folder picker failed" && $0.error == "folder picker did not appear"
            })
            rig.menu.installFolderPicker { picks += 1; return nil }
            await rig.menu.sendSettings(.changeFolder)
            #expect(picks == 2)
            if case .idle = rig.menu.settingsState.folder.status {} else { Issue.record("still failed") }
            await rig.finish()
        }
    }
}
