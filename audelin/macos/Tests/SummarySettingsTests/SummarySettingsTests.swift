import SummarySettings
import Testing

@Suite struct SummarySettingsTests {
    let reducer = Reducer(disclosure: { "recipients: \($0.primary.endpoint), \($0.fallback.endpoint)" }, message: { "\($0)" })
    @Test func loadFailurePreservesDataAndCanRetry() async {
        let preferences = PreferencesSpy(fails: true)
        let handler = EffectHandler(preferences: preferences, availability: AvailabilitySpy(error: nil))
        let (loading, effect) = reducer.reduce(.init(), .load)
        #expect(effect == .load)
        let failed = reducer.reduce(loading, await handler.handle(.load)).0
        #expect(failed.phase == .loadFailed)
        #expect(failed.draft == nil)
        #expect(reducer.reduce(failed, .save).1 == nil)
        #expect(reducer.reduce(failed, .load).1 == .load)
        #expect(await preferences.saves == [])
    }
    @Test func validationAndSaveAreRevisionBoundAndPreventDuplicateSave() async {
        let config = configuration(enabled: true)
        let (loaded, _) = reducer.reduce(.init(phase: .loading), .loaded(config))
        var edit = config; edit.fallback.model = "changed-model"
        let edited = reducer.reduce(loaded, .edit(edit)).0
        let (validating, effect) = reducer.reduce(edited, .validate)
        #expect(effect == .validate(1, edit))
        let preferences = PreferencesSpy(fails: false)
        let handler = EffectHandler(preferences: preferences, availability: AvailabilitySpy(error: nil))
        #expect(await handler.handle(effect!) == .validated(1, nil))
        var changed = edit; changed.primary.model = "newer"
        let newer = reducer.reduce(validating, .edit(changed)).0
        #expect(reducer.reduce(newer, .validated(1, nil)).0 == newer)
        #expect(reducer.reduce(newer, .save).1 == nil)
        let approved = reducer.reduce(validating, .validated(1, nil)).0
        let (saving, save) = reducer.reduce(approved, .save)
        #expect(save == .save(1, edit))
        #expect(reducer.reduce(saving, .save).1 == nil)
        let whileSaving = reducer.reduce(saving, .edit(changed)).0
        let savedEvent = await handler.handle(save!)
        let saved = reducer.reduce(whileSaving, savedEvent).0
        #expect(saved.saved == edit)
        #expect(saved.draft == changed)
        #expect(saved.phase == .editing)
        #expect(await preferences.saves == [edit])
    }
    @Test func failedSaveRetainsEditsAndOffSwitchNeedsNoValidation() async {
        let config = configuration(enabled: true)
        let initial = State(phase: .saved, draft: config, saved: config)
        var off = config; off.enabled = false
        let edited = reducer.reduce(initial, .edit(off)).0
        let (saving, effect) = reducer.reduce(edited, .save)
        #expect(effect == .save(1, off))
        let handler = EffectHandler(preferences: PreferencesSpy(fails: true), availability: AvailabilitySpy(error: "unavailable"))
        let failed = reducer.reduce(saving, await handler.handle(effect!)).0
        #expect(failed.phase == .saveFailed)
        #expect(failed.draft == off)
        #expect(failed.saved == config)
        #expect(reducer.reduce(failed, .save).1 == .save(1, off))
    }
    @Test func invalidValidationNeverApprovesSave() async {
        let config = configuration(enabled: true)
        let handler = EffectHandler(preferences: PreferencesSpy(fails: false), availability: AvailabilitySpy(error: "primary model missing"))
        let state = State(phase: .validating, draft: config, revision: 3)
        let result = reducer.reduce(state, await handler.handle(.validate(3, config))).0
        #expect(result.message == "primary model missing")
        #expect(result.validatedRevision == nil)
        #expect(reducer.reduce(result, .save).1 == nil)
    }
}
private func configuration(enabled: Bool) -> Configuration {
    let runtime = Configuration.Runtime(kind: .compatibleAPI, model: "fixture", executable: "", endpoint: "http://127.0.0.1/v1", credentialVariable: "")
    return .init(enabled: enabled, speakers: false, primary: runtime, fallback: runtime)
}
private struct StubError: Error {}
private actor PreferencesSpy: Preferences {
    let fails: Bool
    var saves: [Configuration] = []
    init(fails: Bool) { self.fails = fails }
    func load() throws -> Configuration { if fails { throw StubError() }; return configuration(enabled: false) }
    func save(_ config: Configuration) throws { if fails { throw StubError() }; saves.append(config) }
}
private struct AvailabilitySpy: Availability {
    let error: String?
    func validate(_ config: Configuration) async -> String? { error }
}

@Suite struct SummarySettingsEditTests {
    @Test func fieldEventsEditBothSlotsWithoutLosingEarlierEdits() {
        let reducer = Reducer(disclosure: { $0.primary.endpoint + $0.fallback.endpoint }, message: { "\($0)" })
        let initial = State(phase: .saved, draft: configuration(enabled: false))
        var state = reducer.reduce(initial, .setEnabled(true)).0
        state = reducer.reduce(state, .setSpeakers(true)).0
        state = reducer.reduce(state, .selectKind(.primary, .claudeCLI)).0
        state = reducer.reduce(state, .editField(.primary, .model, "subscription-model")).0
        state = reducer.reduce(state, .editField(.primary, .executable, "/installed/cli")).0
        state = reducer.reduce(state, .editField(.fallback, .model, "local-model")).0
        state = reducer.reduce(state, .editField(.fallback, .endpoint, "http://localhost:123/v1")).0
        state = reducer.reduce(state, .editField(.fallback, .credentialVariable, "")).0
        #expect(state.draft?.enabled == true && state.draft?.speakers == true)
        #expect(state.draft?.primary.model == "subscription-model")
        #expect(state.draft?.primary.executable == "/installed/cli")
        #expect(state.draft?.fallback.model == "local-model")
        #expect(state.draft?.fallback.endpoint == "http://localhost:123/v1")
        #expect(state.draft?.fallback.credentialVariable == "")
        #expect(state.revision == 8)
    }
}
