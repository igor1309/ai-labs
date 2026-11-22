import Foundation
import NotesMenu
import Synchronization
import Testing

struct NotesMenuTests {
    @Test(arguments: [false, true]) func unusableEntriesKeepTheirReasonsAndCannotBeChosen(hasUsableFile: Bool) {
        let broken = NotesMenuState.Template(id: "file:/Daily.md", name: "Daily", usable: false, enabled: false, reason: "Metadata is broken")
        let usable = NotesMenuState.Template(id: "Default", name: "Default", enabled: true, isFile: hasUsableFile)
        let state = makeState { $0.reading = 1 }
        let event = NotesMenuEvent.catalogue(1, [broken, usable])
        assert(state, event) {
            $0.catalogueRevision = 1; $0.templates = [broken, usable]
            $0.offersFolder = true; $0.filesReason = hasUsableFile ? nil : "no files"
        }
        assert(state, event, delivers: nil)
        let listed = NotesMenuReducer(section: { $0 ? "again" : "make" }, noUsableFiles: { "no files" }).reduce(state, event).0
        assert(listed, .choose(broken.id))
        assert(listed, .choose(broken.id), delivers: nil)
        assert(listed, .choose("Default")) { $0.intention = .init(call: "call", template: "Default"); $0.intentions += 1 }
        assert(listed, .choose("Default"), delivers: nil)
    }

    @Test func folderReadFailureKeepsDefaultAndItsReason() async {
        let fallback = NotesMenuState.Template(id: "Default", name: "Default", enabled: true, isFile: false)
        let state = makeState { $0.reading = 1 }
        let event = NotesMenuEvent.catalogue(1, [fallback], folderReason: "Permission denied")
        assert(state, event) {
            $0.catalogueRevision = 1; $0.templates = [fallback]
            $0.filesReason = "Permission denied"; $0.offersFolder = true
        }
        assert(state, event, delivers: nil)
        let handler = NotesMenuEffectHandler(catalogue: { .init(templates: [fallback], folderReason: "Permission denied") },
                                             save: { _ in Issue.record("Unexpected save") }, openFolder: { Issue.record("Unexpected open") })
        #expect(await handler.handle(.catalogue(1)) == event)
    }

    @Test func reopeningReplacesBrokenEntriesWithRepairedFiles() {
        let state = makeState {
            $0.reading = 1; $0.offersFolder = true; $0.filesReason = "no files"
            $0.templates = [.init(id: "file:/Daily.md", name: "Daily", usable: false, enabled: false, reason: "No instructions")]
        }
        assert(state, .opened) { $0.reading = 2 }
        assert(state, .opened, delivers: .catalogue(2))
        var opened = state; opened.reading = 2
        assert(opened, .catalogue(2, templates())) {
            $0.catalogueRevision = 2; $0.templates = templates(); $0.offersFolder = false; $0.filesReason = nil
        }
        assert(opened, .catalogue(2, templates()), delivers: nil)
        assert(opened, .catalogue(1, [], folderReason: "old failure"))
        assert(opened, .catalogue(1, [], folderReason: "old failure"), delivers: nil)
    }

    @Test func noFilesFormattingRunsOnlyForAnAcceptedCatalogueWithoutUsableFiles() {
        let calls = Mutex(0)
        let reducer = NotesMenuReducer(section: { _ in "section" }, noUsableFiles: { calls.withLock { $0 += 1 }; return "injected reason" })
        let state = makeState { $0.reading = 1 }
        #expect(calls.withLock { $0 } == 0)
        _ = reducer.reduce(state, .catalogue(0, []))
        _ = reducer.reduce(state, .catalogue(1, templates()))
        _ = reducer.reduce(state, .catalogue(1, [], folderReason: "disk failure"))
        #expect(calls.withLock { $0 } == 0)
        let result = reducer.reduce(state, .catalogue(1, [.init(id: "Default", name: "Default", enabled: true, isFile: false)]))
        #expect(result.0.filesReason == "injected reason")
        #expect(calls.withLock { $0 } == 1)
    }

    @Test func folderActionWaitsForItsOutcomeAndAllowsRetry() {
        let state = makeState { $0.offersFolder = true; $0.folderFailure = "old failure" }
        assert(state, .openFolder) { $0.openingFolder = true; $0.folderFailure = nil }
        assert(state, .openFolder, delivers: .openFolder)
        let opening = makeState { $0.offersFolder = true; $0.openingFolder = true }
        assert(opening, .openFolder)
        assert(opening, .openFolder, delivers: nil)
        assert(opening, .folderOpened) { $0.openingFolder = false; $0.folderOpened = true }
        assert(opening, .folderOpened, delivers: nil)
        assert(opening, .folderFailed("Finder unavailable")) { $0.openingFolder = false; $0.folderFailure = "Finder unavailable" }
        assert(opening, .folderFailed("Finder unavailable"), delivers: nil)
        assert(makeState(), .openFolder)
        assert(makeState(), .openFolder, delivers: nil)
    }

    @Test(arguments: [false, true]) func folderEffectReportsTheBindingOutcome(fails: Bool) async {
        let calls = Mutex(0)
        let handler = NotesMenuEffectHandler(catalogue: { Issue.record("Unexpected catalogue"); return .init(templates: []) },
            save: { _ in Issue.record("Unexpected save") }, openFolder: {
                calls.withLock { $0 += 1 }
                if fails { throw SaveFailure() }
            })
        #expect(await handler.handle(.openFolder) == (fails ? .folderFailed("disk full") : .folderOpened))
        #expect(calls.withLock { $0 } == 1)
    }

    @Test(arguments: [false, true]) func sectionAndKeepFollowTheShownCall(hasNotes: Bool) {
        let facts = makeFacts(hasNotes: hasNotes)
        assert(.init(), .factsChanged(facts)) {
            $0.facts = facts; $0.section = hasNotes ? "again" : "make"; $0.offersKeeping = hasNotes; $0.opens = true
        }
        assert(.init(), .factsChanged(facts), delivers: nil)
    }

    @Test func sectionFormattingUsesTheInjectedValueAndSkipsNoOpPaths() {
        let spy = SectionSpy()
        let reducer = NotesMenuReducer(section: spy.format, noUsableFiles: { "no files" })
        #expect(spy.calls.withLock { $0 } == [])
        _ = reducer.reduce(.init(), .opened)
        _ = reducer.reduce(makeState(), .choose("Missing"))
        #expect(spy.calls.withLock { $0 } == [])
        for hasNotes in [false, true] {
            let state = reducer.reduce(.init(), .factsChanged(makeFacts(hasNotes: hasNotes))).0
            #expect(state.section == "injected section")
        }
        #expect(spy.calls.withLock { $0 } == [false, true])
    }

    @Test func openingRefreshesTheCatalogueEveryTime() {
        let state = makeState()
        assert(state, .opened) { $0.reading += 1 }
        assert(state, .opened, delivers: .catalogue(1))
        let reopened = makeState { $0.reading = 7 }
        assert(reopened, .opened) { $0.reading = 8 }
        assert(reopened, .opened, delivers: .catalogue(8))
    }

    @Test(arguments: ["Default", "Daily"]) func choosingAnyListedTemplatePublishesOneIntention(id: String) {
        let state = makeState()
        assert(state, .choose(id)) { $0.intention = .init(call: "call", template: id); $0.intentions += 1 }
        assert(state, .choose(id), delivers: nil)
    }

    @Test func busyFactsDisableEveryTemplateAndPublishNoChoice() {
        let facts = makeFacts(busy: true)
        let state = makeState()
        assert(state, .factsChanged(facts)) {
            $0.facts = facts
            for index in $0.templates.indices { $0.templates[index].enabled = false }
        }
        assert(state, .factsChanged(facts), delivers: nil)
        let busy = makeState {
            $0.facts = facts
            for index in $0.templates.indices { $0.templates[index].enabled = false }
        }
        for id in ["Default", "Daily", "Missing"] {
            assert(busy, .choose(id))
            assert(busy, .choose(id), delivers: nil)
        }
        let read = makeState { $0.facts = facts; $0.reading = 2 }
        assert(read, .catalogue(2, templates())) {
            $0.catalogueRevision = 2
            for index in $0.templates.indices { $0.templates[index].enabled = false }
        }
        assert(read, .catalogue(2, templates()), delivers: nil)
    }

    @Test func busyMenuWithEveryItemDisabledDoesNotOpen() {
        let facts = makeFacts(hasNotes: false, busy: true)
        let state = makeState()
        assert(state, .factsChanged(facts)) {
            $0.facts = facts; $0.section = "make"; $0.offersKeeping = false; $0.opens = false
            for index in $0.templates.indices { $0.templates[index].enabled = false }
        }
        assert(state, .factsChanged(facts), delivers: nil)
        let closed = makeState {
            $0.facts = facts; $0.offersKeeping = false; $0.opens = false
            for index in $0.templates.indices { $0.templates[index].enabled = false }
        }
        assert(closed, .opened)
        assert(closed, .opened, delivers: nil)
        assert(closed, .factsChanged(makeFacts(hasNotes: false))) {
            $0.facts = makeFacts(hasNotes: false); $0.section = "make"; $0.opens = true
            for index in $0.templates.indices { $0.templates[index].enabled = true }
        }
        assert(closed, .factsChanged(makeFacts(hasNotes: false)), delivers: nil)
    }

    @Test func busyMenuOpensWhileItsKeepToggleOrFolderItemCanBeUsed() {
        let busy = makeState { $0.facts = makeFacts(busy: true) }
        #expect(busy.opens)
        assert(busy, .toggleKeeping) { $0.saving = true; $0.opens = false }
        assert(busy, .toggleKeeping, delivers: .saveKeeping(false))
        let folder = makeState { $0.facts = makeFacts(busy: true); $0.offersKeeping = false; $0.offersFolder = true }
        #expect(folder.opens)
        assert(folder, .openFolder) { $0.openingFolder = true; $0.opens = false }
        assert(folder, .openFolder, delivers: .openFolder)
    }

    @Test func stoppingReenablesUsableTemplatesOnly() {
        let state = makeState {
            $0.facts = makeFacts(busy: true)
            $0.templates = [.init(id: "Default", name: "Default", enabled: true), .init(id: "Other", name: "Other", usable: false, enabled: false)]
            $0.templates[0].enabled = false
        }
        assert(state, .factsChanged(makeFacts())) { $0.facts = makeFacts(); $0.templates[0].enabled = true }
        assert(state, .factsChanged(makeFacts()), delivers: nil)
    }

    @Test func staleCatalogueCannotReplaceTheReopenedMenu() {
        let state = makeState { $0.reading = 2 }
        assert(state, .catalogue(1, []))
        assert(state, .catalogue(1, []), delivers: nil)
    }

    @Test(arguments: [false, true]) func keepWaitsForTheSaveBeforeChanging(keeping: Bool) {
        let state = makeState { $0.keeping = keeping }
        assert(state, .toggleKeeping) { $0.saving = true }
        assert(state, .toggleKeeping, delivers: .saveKeeping(!keeping))
        let saving = makeState { $0.keeping = keeping; $0.saving = true }
        assert(saving, .keepingSaved(!keeping)) { $0.keeping = !keeping; $0.saving = false }
        assert(saving, .keepingSaved(!keeping), delivers: nil)
        assert(saving, .keepingFailed("disk full")) { $0.saving = false; $0.saveFailure = "disk full" }
        assert(saving, .keepingFailed("disk full"), delivers: nil)
        assert(saving, .toggleKeeping)
        assert(saving, .toggleKeeping, delivers: nil)
    }

    @Test func aGlobalKeepChangeReachesTheMenu() {
        assert(makeState(), .keepingChanged(false)) { $0.keeping = false }
        assert(makeState(), .keepingChanged(false), delivers: nil)
    }

    @Test func noShownCallOrKeepItemMeansNoAction() {
        for event in [NotesMenuEvent.opened, .choose("Default"), .toggleKeeping] {
            assert(.init(), event)
            assert(.init(), event, delivers: nil)
        }
    }

    @Test(arguments: [false, true]) func effectReadsTheCatalogueAndPreservesItsRevision(broken: Bool) async {
        var entries = templates()
        if broken { entries[1] = .init(id: "file:/Daily.md", name: "Daily", usable: false, enabled: false, reason: "Missing required headings") }
        let spy = MenuSpy()
        let handler = NotesMenuEffectHandler(catalogue: { .init(templates: await spy.catalogue()) }, save: { try await spy.save($0) }, openFolder: {})
        async let event = handler.handle(.catalogue(3))
        await spy.completeCatalogue(entries)
        #expect(await event == .catalogue(3, entries))
        #expect(await spy.saves == [])
    }

    @Test(arguments: [false, true]) func effectSavesExactlyTheRequestedKeepValue(keeping: Bool) async {
        let spy = MenuSpy()
        let handler = NotesMenuEffectHandler(catalogue: { .init(templates: await spy.catalogue()) }, save: { try await spy.save($0) }, openFolder: {})
        async let event = handler.handle(.saveKeeping(keeping))
        await spy.completeSave(.success(()))
        #expect(await event == .keepingSaved(keeping))
        #expect(await spy.saves == [keeping])
    }

    @Test func effectReturnsTheSaveFailure() async {
        let spy = MenuSpy()
        let handler = NotesMenuEffectHandler(catalogue: { .init(templates: await spy.catalogue()) }, save: { try await spy.save($0) }, openFolder: {})
        async let event = handler.handle(.saveKeeping(false))
        await spy.completeSave(.failure(SaveFailure()))
        #expect(await event == .keepingFailed("disk full"))
    }
}

private struct SaveFailure: LocalizedError { var errorDescription: String? { "disk full" } }
private func templates() -> [NotesMenuState.Template] {
    [.init(id: "Default", name: "Default", enabled: true), .init(id: "Daily", name: "Daily", enabled: true)]
}
private func makeFacts(hasNotes: Bool = true, busy: Bool = false) -> NotesMenuState.Facts {
    .init(call: "call", hasNotes: hasNotes, template: hasNotes ? "Default" : nil, busy: busy)
}
private func makeState(_ change: (inout NotesMenuState) -> Void = { _ in }) -> NotesMenuState {
    var state = NotesMenuState(facts: makeFacts(), section: "again", templates: templates(), offersKeeping: true)
    change(&state)
    return state
}
private func assert(_ state: NotesMenuState, _ event: NotesMenuEvent, sourceLocation: SourceLocation = #_sourceLocation,
                    mutation: (inout NotesMenuState) -> Void = { _ in }) {
    var expected = state; mutation(&expected)
    #expect(NotesMenuReducer(section: { $0 ? "again" : "make" }, noUsableFiles: { "no files" }).reduce(state, event).0 == expected, sourceLocation: sourceLocation)
}
private func assert(_ state: NotesMenuState, _ event: NotesMenuEvent, delivers effect: NotesMenuEffect?, sourceLocation: SourceLocation = #_sourceLocation) {
    #expect(NotesMenuReducer(section: { $0 ? "again" : "make" }, noUsableFiles: { "no files" }).reduce(state, event).1 == effect, sourceLocation: sourceLocation)
}
private actor MenuSpy {
    private(set) var saves: [Bool] = []
    private var read: CheckedContinuation<[NotesMenuState.Template], Never>?
    private var saveResult: CheckedContinuation<Void, any Error>?
    private var started: CheckedContinuation<Void, Never>?
    func catalogue() async -> [NotesMenuState.Template] {
        await withCheckedContinuation { read = $0; started?.resume(); started = nil }
    }
    func save(_ keeping: Bool) async throws {
        saves.append(keeping)
        try await withCheckedThrowingContinuation { saveResult = $0; started?.resume(); started = nil }
    }
    func completeCatalogue(_ templates: [NotesMenuState.Template]) async {
        if read == nil { await withCheckedContinuation { started = $0 } }
        read?.resume(returning: templates); read = nil
    }
    func completeSave(_ result: Result<Void, any Error>) async {
        if saveResult == nil { await withCheckedContinuation { started = $0 } }
        saveResult?.resume(with: result); saveResult = nil
    }
}

private final class SectionSpy: Sendable {
    let calls = Mutex<[Bool]>([])
    func format(_ hasNotes: Bool) -> String {
        calls.withLock { $0.append(hasNotes) }
        return "injected section"
    }
}
