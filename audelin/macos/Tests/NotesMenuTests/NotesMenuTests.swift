import Foundation
import NotesMenu
import Synchronization
import Testing

struct NotesMenuTests {
    @Test(arguments: [false, true]) func sectionAndKeepFollowTheShownCall(hasNotes: Bool) {
        let facts = makeFacts(hasNotes: hasNotes)
        assert(.init(), .factsChanged(facts)) {
            $0.facts = facts; $0.section = hasNotes ? "again" : "make"; $0.offersKeeping = hasNotes
        }
        assert(.init(), .factsChanged(facts), delivers: nil)
    }

    @Test func sectionFormattingUsesTheInjectedValueAndSkipsNoOpPaths() {
        let spy = SectionSpy()
        let reducer = NotesMenuReducer(section: spy.format)
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

    @Test func effectReadsTheCatalogueAndPreservesItsRevision() async {
        let spy = MenuSpy()
        let handler = NotesMenuEffectHandler(catalogue: { await spy.catalogue() }, save: { try await spy.save($0) })
        async let event = handler.handle(.catalogue(3))
        await spy.completeCatalogue(templates())
        #expect(await event == .catalogue(3, templates()))
        #expect(await spy.saves == [])
    }

    @Test(arguments: [false, true]) func effectSavesExactlyTheRequestedKeepValue(keeping: Bool) async {
        let spy = MenuSpy()
        let handler = NotesMenuEffectHandler(catalogue: { await spy.catalogue() }, save: { try await spy.save($0) })
        async let event = handler.handle(.saveKeeping(keeping))
        await spy.completeSave(.success(()))
        #expect(await event == .keepingSaved(keeping))
        #expect(await spy.saves == [keeping])
    }

    @Test func effectReturnsTheSaveFailure() async {
        let spy = MenuSpy()
        let handler = NotesMenuEffectHandler(catalogue: { await spy.catalogue() }, save: { try await spy.save($0) })
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
    #expect(NotesMenuReducer(section: { $0 ? "again" : "make" }).reduce(state, event).0 == expected, sourceLocation: sourceLocation)
}
private func assert(_ state: NotesMenuState, _ event: NotesMenuEvent, delivers effect: NotesMenuEffect?, sourceLocation: SourceLocation = #_sourceLocation) {
    #expect(NotesMenuReducer(section: { $0 ? "again" : "make" }).reduce(state, event).1 == effect, sourceLocation: sourceLocation)
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
