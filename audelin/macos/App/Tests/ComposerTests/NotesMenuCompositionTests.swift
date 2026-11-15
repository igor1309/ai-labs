import CallDetail
import Foundation
import Observation
import Preferences
import Recordings
import Testing
@testable import Composer

@MainActor @Suite(.timeLimit(.minutes(1)))
struct NotesMenuCompositionTests {
    @Test func anotherPresentedDetailReceivesTheSavedKeepChoice() async throws {
        try await withComposeFolder { root in
            let preferences = PreferencesStore(fileURL: root.appendingPathComponent("preferences.json"))
            try preferences.write(Preferences())
            let first = makeCalls(preferences: preferences)
            let second = makeCalls(preferences: preferences)
            await first.send(.select("1970.01.01-1000")); await second.send(.select("1970.01.01-1000"))
            for await offers in Observations({ first.notesMenu.offersKeeping }) where offers { break }
            for await offers in Observations({ second.notesMenu.offersKeeping }) where offers { break }
            #expect(first.notesMenu.keeping && second.notesMenu.keeping)
            await first.send(detail: .toggleKeeping)
            for await menu in Observations({ second.notesMenu }) where !menu.keeping { break }
            for await menu in Observations({ first.notesMenu }) where !menu.keeping && !menu.saving { break }
            #expect(!preferences.read().keepPreviousNotes)
            #expect(first.notesMenu.saveFailure == nil)
        }
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
@MainActor private func makeCalls(preferences: PreferencesStore? = nil, copy: @escaping (String) -> Void = { _ in }) -> AudelinCalls {
    let listing = RecordingsState(calls: [.init(id: "1970.01.01-1000", title: "Call", start: Date(timeIntervalSince1970: 36_000), duration: 60)])
    return AudelinCalls(inputs: RecordingsInputs(state: { listing }, send: { _ in }), timeZone: .gmt,
                        now: { Date(timeIntervalSince1970: 40_000) }, recordingState: { .init() },
                        location: { _ in URL(fileURLWithPath: "/unused") }, openFolder: { _ in false }, present: {},
                        notes: { _ in .init(previous: .init(text: "old Markdown", made: "before"), current: .init(text: "new Markdown", made: "now")) },
                        keepingChanges: preferences?.keepingChanges() ?? AsyncStream { $0.finish() },
                        readKeeping: { preferences?.read().keepPreviousNotes ?? true },
                        saveKeeping: { try preferences?.updateKeeping($0) }, copy: copy)
}
