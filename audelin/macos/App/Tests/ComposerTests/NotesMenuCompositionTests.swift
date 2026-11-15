import CallDetail
import Foundation
import Observation
import Preferences
import Recordings
import TemplateFiles
import Testing
@testable import Composer

@MainActor @Suite(.timeLimit(.minutes(1)))
struct NotesMenuCompositionTests {
    @Test(arguments: [false, true]) func brokenFilesAndFolderOutcomesReachThePresentedMenu(opens: Bool) async throws {
        try await withComposeFolder { root in
            let folder = root.appendingPathComponent("Templates")
            try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: false)
            let broken = folder.appendingPathComponent("Default.md")
            try "broken metadata".write(to: broken, atomically: true, encoding: .utf8)
            var opened: [URL] = []
            let rig = try await ComposeFixture.make(root: root, openFolder: { opened.append($0); return opens })
            do {
                let calls = try #require(rig.menu.calls)
                let call = root.appendingPathComponent("1970.01.01-1000")
                try FileManager.default.createDirectory(at: call, withIntermediateDirectories: false)
                try "**Me** 00:00:03\n\nWords".write(to: call.appendingPathComponent("transcript.md"), atomically: true, encoding: .utf8)
                await rig.menu.perform(.showCalls)
                for await state in Observations({ calls.state }) where !state.rows.isEmpty { break }
                await calls.send(.read("1970.01.01-1000"))
                for await facts in Observations({ calls.notesMenu.facts }) where facts != nil { break }
                await calls.send(detail: .notesMenuOpened)
                for await menu in Observations({ calls.notesMenu }) where menu.catalogueRevision == 1 { break }
                let menu = calls.notesMenu
                #expect(menu.templates.map(\.id) == ["file:/Default.md", "Default"])
                #expect(menu.templates[0].reason?.contains("Metadata") == true && !menu.templates[0].enabled)
                #expect(menu.templates[1].enabled && menu.filesReason != nil && menu.offersFolder)
                await calls.send(detail: .openTemplatesFolder)
                for await menu in Observations({ calls.notesMenu }) where menu.folderOpened || menu.folderFailure != nil { break }
                #expect(opened.map(\.standardizedFileURL.path) == [folder.standardizedFileURL.path])
                #expect(calls.notesMenu.folderOpened == opens)
                #expect((calls.notesMenu.folderFailure != nil) == !opens)
                #expect(try String(contentsOf: broken, encoding: .utf8) == "broken metadata")
                try TemplateFiles.Files.encode(TemplateFiles.Files.builtInDefault).write(to: broken, atomically: true, encoding: .utf8)
                await calls.send(detail: .notesMenuOpened)
                for await menu in Observations({ calls.notesMenu }) where menu.catalogueRevision == 2 { break }
                #expect(calls.notesMenu.templates.map(\.id) == ["Default"])
                #expect(calls.notesMenu.templates[0].enabled && calls.notesMenu.templates[0].reason == nil)
                #expect(calls.notesMenu.filesReason == nil && !calls.notesMenu.offersFolder)
                await rig.finish()
            } catch { await rig.finish(); throw error }
        }
    }

    @Test(arguments: [false, true]) func anotherPresentedDetailReceivesTheSavedKeepChoice(initialKeeping: Bool) async throws {
        try await withComposeFolder { root in
            let preferences = PreferencesStore(fileURL: root.appendingPathComponent("preferences.json"))
            var initial = Preferences(); initial.keepPreviousNotes = initialKeeping
            try preferences.write(initial)
            let first = makeCalls(preferences: preferences)
            let second = makeCalls(preferences: preferences)
            await first.send(.select("1970.01.01-1000")); await second.send(.select("1970.01.01-1000"))
            for await offers in Observations({ first.notesMenu.offersKeeping }) where offers { break }
            for await offers in Observations({ second.notesMenu.offersKeeping }) where offers { break }
            #expect(first.notesMenu.keeping == initialKeeping)
            #expect(second.notesMenu.keeping == initialKeeping)
            await first.send(detail: .toggleKeeping)
            for await menu in Observations({ second.notesMenu }) where menu.keeping != initialKeeping { break }
            for await menu in Observations({ first.notesMenu }) where menu.keeping != initialKeeping && !menu.saving { break }
            #expect(preferences.read().keepPreviousNotes == !initialKeeping)
            #expect(first.notesMenu.keeping == !initialKeeping && second.notesMenu.keeping == !initialKeeping)
            #expect(first.notesMenu.saveFailure == nil)
        }
    }

    @Test func anotherCallsCancellationIsForwardedBeforeTheFirstSettles() async {
        let spy = Cancellations()
        let calls = makeCalls(busy: true, cancelSummary: spy.cancel)
        await calls.send(.select("1970.01.01-1000"))
        for await detail in Observations({ calls.detail }) where detail?.progress != nil { break }
        await calls.send(detail: .cancelNotes)
        for await received in Observations({ spy.calls }) where received == ["1970.01.01-1000"] { break }
        await calls.send(.select("1970.01.01-0900"))
        for await detail in Observations({ calls.detail }) where detail?.id == "1970.01.01-0900" && detail?.progress != nil { break }
        await calls.send(detail: .cancelNotes)
        for await received in Observations({ spy.calls }) where received.count == 2 { break }
        #expect(spy.calls == ["1970.01.01-1000", "1970.01.01-0900"])
        #expect(!spy.firstFinished)
        spy.release()
        for await finished in Observations({ spy.firstFinished }) where finished { break }
    }

    @Test func copyUsesTheVersionChosenThroughTheDetailEndpoint() async throws {
        let copied = Copies()
        let calls = makeCalls(copy: { copied.values.append($0) })
        await calls.send(.select("1970.01.01-1000"))
        for await detail in Observations({ calls.detail }) where detail?.pair != nil { break }
        await calls.send(detail: .chooseNotesVersion(.previous))
        for await detail in Observations({ calls.detail }) where detail?.version == .previous { break }
        await calls.send(detail: .copy)
        await calls.send(detail: .chooseNotesVersion(.current))
        for await detail in Observations({ calls.detail }) where detail?.version == .current { break }
        await calls.send(detail: .copy)
        #expect(copied.values == ["old Markdown", "new Markdown"])
    }
}
@MainActor private final class Copies { var values: [String] = [] }
@MainActor private func makeCalls(preferences: PreferencesStore? = nil, busy: Bool = false, cancelSummary: @escaping (String) async -> Void = { _ in }, copy: @escaping (String) -> Void = { _ in }) -> AudelinCalls {
    let listing = RecordingsState(calls: ["1970.01.01-1000", "1970.01.01-0900"].map { .init(id: $0, title: "Call", start: Date(timeIntervalSince1970: 36_000), duration: 60) })
    return AudelinCalls(inputs: RecordingsInputs(state: { listing }, send: { _ in }), timeZone: .gmt,
                        now: { Date(timeIntervalSince1970: 40_000) }, recordingState: { .init() },
                        location: { _ in URL(fileURLWithPath: "/unused") }, openFolder: { _ in false }, present: {},
                        summaryBadges: { busy ? ["1970.01.01-1000": .pending, "1970.01.01-0900": .pending] : [:] },
                        notes: { _ in .init(previous: .init(text: "old Markdown", made: "before"), current: .init(text: "new Markdown", made: "now")) },
                        keepingChanges: preferences?.keepingChanges() ?? AsyncStream { $0.finish() },
                        readKeeping: { preferences?.read().keepPreviousNotes ?? true },
                        saveKeeping: { try preferences?.updateKeeping($0) }, cancelSummary: cancelSummary, copy: copy)
}

@MainActor @Observable private final class Cancellations {
    var calls: [String] = []
    var firstFinished = false
    private var pending: CheckedContinuation<Void, Never>?
    func cancel(_ call: String) async {
        calls.append(call)
        if call == "1970.01.01-1000" {
            await withCheckedContinuation { pending = $0 }
            firstFinished = true
        }
    }
    func release() { pending?.resume(); pending = nil }
}
