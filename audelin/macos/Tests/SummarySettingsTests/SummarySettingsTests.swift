import SummarySettings
import Synchronization
import Testing

@Suite struct SummarySettingsTests {
    let reducer = makeReducer()
    @Test(arguments: [false, true])
    func checkingSavedSettingsDoesNotClaimUnsavedChanges(edited: Bool) async {
        let loaded = reducer.reduce(.init(phase: .loading), .loaded(configuration(enabled: true))).0
        let before = edited ? reducer.reduce(loaded, .setSpeakers(true)).0 : loaded
        let (checking, effect) = reducer.reduce(before, .validate)
        #expect(effect == .validate(before.revision, before.draft!))
        let preferences = PreferencesSpy(fails: false)
        let handler = EffectHandler(preferences: preferences, availability: AvailabilitySpy(issues: []))
        let (result, followUp) = reducer.reduce(checking, await handler.handle(effect!))
        #expect(result.phase == (edited ? .editing : .saved))
        #expect(result.message == (edited ? "editing" : "saved"))
        #expect(result.canSave == edited && result.canValidate)
        #expect(result.draft == before.draft && result.saved == loaded.saved)
        #expect(followUp == nil)
        #expect(await preferences.saves.isEmpty)
    }

    @Test func revertingEditsRestoresSavedStatus() {
        let loaded = reducer.reduce(.init(phase: .loading), .loaded(configuration(enabled: true))).0
        let edited = reducer.reduce(loaded, .setSpeakers(true)).0
        let (restored, effect) = reducer.reduce(edited, .setSpeakers(false))
        #expect(restored.draft == restored.saved)
        #expect(restored.phase == .saved && restored.message == "saved")
        #expect(!restored.canSave && restored.canValidate)
        #expect(effect == nil)
    }

    @Test func loadFailurePreservesDataAndCanRetry() async {
        let preferences = PreferencesSpy(fails: true)
        let handler = EffectHandler(preferences: preferences, availability: AvailabilitySpy(issues: []))
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
        var edit = config; edit.fallback?.model = "changed-model"
        let edited = reducer.reduce(loaded, .edit(edit)).0
        let (validating, effect) = reducer.reduce(edited, .validate)
        #expect(effect == .validate(1, edit))
        let preferences = PreferencesSpy(fails: false)
        let handler = EffectHandler(preferences: preferences, availability: AvailabilitySpy(issues: []))
        #expect(await handler.handle(effect!) == .validated(1, []))
        var changed = edit; changed.primary.model = "newer"
        let newer = reducer.reduce(validating, .edit(changed)).0
        #expect(reducer.reduce(newer, .validated(1, [])).0 == newer)
        #expect(reducer.reduce(newer, .save).1 == .validate(2, changed))
        let approved = reducer.reduce(validating, .validated(1, [])).0
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
    @Test func saveValidatesAndPersistsWithoutSeparateValidateClick() async {
        let config = configuration(enabled: true)
        let loaded = reducer.reduce(.init(phase: .loading), .loaded(config)).0
        let edited = reducer.reduce(loaded, .setSpeakers(true)).0
        #expect(edited.canSave)
        let preferences = PreferencesSpy(fails: false)
        let availability = RecordingAvailability(issues: [])
        let handler = EffectHandler(preferences: preferences, availability: availability)
        let (checking, check) = reducer.reduce(edited, .save)
        #expect(check == .validate(1, edited.draft!))
        #expect(!checking.canSave && !checking.canValidate)
        #expect(reducer.reduce(checking, .save).1 == nil)
        let (saving, save) = reducer.reduce(checking, await handler.handle(check!))
        #expect(save == .save(1, edited.draft!))
        #expect(await preferences.saves.isEmpty)
        let saved = reducer.reduce(saving, await handler.handle(save!)).0
        #expect(saved.saved == edited.draft && !saved.canSave)
        #expect(await preferences.saves == [edited.draft!])
        #expect(await availability.calls == [edited.draft!])
    }
    @Test func editDuringSaveValidationCancelsAutomaticSave() {
        let edited = reducer.reduce(makeState(), .setEnabled(true)).0
        let checking = reducer.reduce(edited, .save).0
        let newer = reducer.reduce(checking, .setSpeakers(true)).0
        #expect(newer.canSave && !newer.saveAfterValidation)
        #expect(reducer.reduce(newer, .validated(checking.revision, [])).0 == newer)
        let (checkingNewer, check) = reducer.reduce(newer, .validate)
        #expect(check == .validate(newer.revision, newer.draft!))
        #expect(reducer.reduce(checkingNewer, .validated(newer.revision, [])).1 == nil)
    }
    @Test func failedSaveValidationRetainsDraftWithoutPersisting() async {
        let edited = reducer.reduce(makeState(), .setEnabled(true)).0
        let preferences = PreferencesSpy(fails: false)
        let issue = ValidationIssue(slot: .primary, field: .executable, reason: .unavailable)
        let handler = EffectHandler(preferences: preferences, availability: AvailabilitySpy(issues: [issue]))
        let (checking, check) = reducer.reduce(edited, .save)
        let (failed, effect) = reducer.reduce(checking, await handler.handle(check!))
        #expect(effect == nil && failed.issues == [issue])
        #expect(failed.draft == edited.draft && failed.saved == edited.saved)
        #expect(!failed.canSave && !failed.saveAfterValidation)
        #expect(await preferences.saves.isEmpty)
    }
    @Test func failedSaveRetainsEditsAndOffSwitchNeedsNoValidation() async {
        let config = configuration(enabled: true)
        let initial = State(phase: .saved, draft: config, saved: config)
        var off = config; off.enabled = false
        let edited = reducer.reduce(initial, .edit(off)).0
        let (saving, effect) = reducer.reduce(edited, .save)
        #expect(effect == .save(1, off))
        let handler = EffectHandler(preferences: PreferencesSpy(fails: true), availability: AvailabilitySpy(issues: [.init(slot: .primary, field: .executable, reason: .unavailable)]))
        let failed = reducer.reduce(saving, await handler.handle(effect!)).0
        #expect(failed.phase == .saveFailed)
        #expect(failed.draft == off)
        #expect(failed.saved == config)
        #expect(reducer.reduce(failed, .save).1 == .save(1, off))
    }
    @Test func invalidValidationNeverApprovesSave() async {
        let config = configuration(enabled: true)
        let handler = EffectHandler(preferences: PreferencesSpy(fails: false), availability: AvailabilitySpy(issues: [.init(slot: .primary, field: .model)]))
        let state = State(phase: .validating, draft: config, revision: 3)
        let result = reducer.reduce(state, await handler.handle(.validate(3, config))).0
        #expect(result.message == "issue: primary model")
        #expect(result.runtimes[0].fields[0].isInvalid)
        #expect(!result.canSave)
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
    let issues: [ValidationIssue]
    func validate(_ config: Configuration) async -> [ValidationIssue] { issues }
}

@Suite struct SummarySettingsEditTests {
    @Test(arguments: [Slot.primary, .fallback])
    func selectingCLIUsesDiscoveryAndDiscardsHiddenAPIFields(slot: Slot) {
        var given = makeState()
        let api = Configuration.Runtime(kind: .compatibleAPI, model: "api", executable: "/stale/cli", endpoint: "https://user:secret@example.com/v1", credentialVariable: "secret=value")
        if slot == .primary { given.draft?.primary = api } else { given.draft?.fallback = api }
        let (result, effect) = makeReducer().reduce(given, .selectKind(slot, .claudeCLI))
        let runtime = slot == .primary ? result.draft?.primary : result.draft?.fallback
        #expect(runtime?.endpoint == "")
        #expect(runtime?.credentialVariable == "")
        #expect(runtime?.executable == "")
        #expect(runtime?.model == "sonnet" && runtime?.kind == .claudeCLI)
        #expect(result.runtimes[slot == .primary ? 0 : 1].fields.map(\.field) == [.model, .executable])
        #expect(effect == nil)
    }

    @Test func absentFallbackCanBeAddedAndRemovedWithoutChangingPrimary() {
        let reducer = makeReducer()
        let given = makeState()
        let (cleared, clearEffect) = reducer.reduce(given, .selectKind(.fallback, nil))
        #expect(clearEffect == nil && cleared.draft?.fallback == nil)
        #expect(cleared.runtimes[1].kind == nil && cleared.runtimes[1].fields.isEmpty)
        #expect(cleared.draft?.primary == given.draft?.primary)
        #expect(reducer.reduce(cleared, .editField(.fallback, .model, "stale")).0 == cleared)
        #expect(reducer.reduce(cleared, .selectKind(.primary, nil)).0 == cleared)
        let (added, addEffect) = reducer.reduce(cleared, .selectKind(.fallback, .claudeCLI))
        #expect(addEffect == nil && added.draft?.fallback?.model == "sonnet")
        #expect(added.runtimes[1].fields.map(\.field) == [.model, .executable])
        #expect(added.draft?.primary == given.draft?.primary)
    }

    @Test func fieldEventsEditBothSlotsWithoutLosingEarlierEdits() {
        let reducer = makeReducer()
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
        #expect(state.draft?.fallback?.model == "local-model")
        #expect(state.draft?.fallback?.endpoint == "http://localhost:123/v1")
        #expect(state.draft?.fallback?.credentialVariable == "")
        #expect(state.revision == 8)
    }
}

private func makeReducer() -> Reducer {
    Reducer(disclosure: { "recipients: \($0.primary.endpoint), \($0.fallback?.endpoint)" },
            message: { "\($0)" }, safety: { _ in [] },
            issueMessage: { "issue: \($0.slot) \($0.field)" }, runtimeDisclosure: { "runtime: \($0?.model ?? "none")" })
}

@Suite struct SummarySettingsRenderedStateTests {
    @Test func pureDependenciesReceiveExactEditsAndTheirValuesAreRendered() {
        let disclosureCalls = Mutex<[Configuration]>([])
        let safetyCalls = Mutex<[Configuration]>([])
        let runtimeCalls = Mutex<[Configuration.Runtime?]>([])
        let messageCalls = Mutex<[State.Phase]>([])
        let issueCalls = Mutex<[ValidationIssue]>([])
        let issue = ValidationIssue(slot: .fallback, field: .endpoint, hidesValue: true)
        let reducer = Reducer(disclosure: { config in
            disclosureCalls.withLock { $0.append(config) }; return "disclosure stub"
        }, message: { phase in
            messageCalls.withLock { $0.append(phase) }; return "message stub"
        }, safety: { config in
            safetyCalls.withLock { $0.append(config) }; return [issue]
        }, issueMessage: { value in
            issueCalls.withLock { $0.append(value) }; return "correction stub"
        }, runtimeDisclosure: { runtime in
            runtimeCalls.withLock { $0.append(runtime) }; return "runtime stub"
        })
        let given = makeState()
        assert(reducer, given, .validated(99, []), delivers: nil)
        #expect(disclosureCalls.withLock { $0.isEmpty })
        #expect(safetyCalls.withLock { $0.isEmpty })
        #expect(runtimeCalls.withLock { $0.isEmpty })
        #expect(messageCalls.withLock { $0.isEmpty })
        #expect(issueCalls.withLock { $0.isEmpty })
        var edited = configuration(enabled: false)
        edited.fallback?.endpoint = "https://user:secret@example.com/?secret#secret"
        assert(reducer, given, .edit(edited), delivers: nil) {
            $0.draft = edited; $0.revision = 1; $0.phase = .editing
            $0.disclosure = "disclosure stub"; $0.issues = [issue]; $0.message = "correction stub"
            $0.canValidate = true; $0.statusTone = .error
            $0.runtimes = [.init(slot: .primary, kind: .compatibleAPI, fields: [
                .init(field: .model, value: "fixture", isInvalid: false),
                .init(field: .endpoint, value: "http://127.0.0.1/v1", isInvalid: false),
                .init(field: .credentialVariable, value: "", isInvalid: false)
            ], disclosure: "runtime stub"), .init(slot: .fallback, kind: .compatibleAPI, fields: [
                .init(field: .model, value: "fixture", isInvalid: false),
                .init(field: .endpoint, value: "", isInvalid: true),
                .init(field: .credentialVariable, value: "", isInvalid: false)
            ], disclosure: "runtime stub")]
        }
        #expect(disclosureCalls.withLock { $0 } == [edited])
        #expect(safetyCalls.withLock { $0 } == [edited])
        #expect(runtimeCalls.withLock { $0 } == [edited.primary, edited.fallback!])
        #expect(issueCalls.withLock { $0 } == [issue])
        #expect(messageCalls.withLock { $0.isEmpty })
        assert(reducer, makeEmptyState(), .load, delivers: .load) {
            $0.phase = .loading; $0.message = "message stub"
        }
        #expect(messageCalls.withLock { $0 } == [.loading])
    }

    @Test func saveRechecksSyntaxEvenForDisabledPreviouslyApprovedDraft() {
        let calls = Mutex<[Configuration]>([])
        let issue = ValidationIssue(slot: .fallback, field: .endpoint, hidesValue: true)
        let reducer = Reducer(disclosure: { _ in "" }, message: { "\($0)" }, safety: { config in
            calls.withLock { $0.append(config) }; return [issue]
        }, issueMessage: { _ in "correct fallback URL" }, runtimeDisclosure: { _ in "" })
        var config = configuration(enabled: false); config.fallback?.endpoint = "http://remote.example"
        let given = State(phase: .editing, draft: config, saved: configuration(enabled: false), revision: 2, validatedRevision: 2)
        let (result, effect) = reducer.reduce(given, .save)
        #expect(effect == nil)
        #expect(!result.canSave && result.issues == [issue])
        #expect(result.runtimes[1].fields[1].isInvalid)
        #expect(calls.withLock { $0 } == [config])
    }

    @Test func disabledValidationAndSaveDoNotConsultAvailability() async {
        let availability = RecordingAvailability(issues: [.init(slot: .primary, field: .executable, reason: .unavailable)])
        let preferences = PreferencesSpy(fails: false)
        let handler = EffectHandler(preferences: preferences, availability: availability)
        let config = configuration(enabled: false)
        #expect(await handler.handle(.validate(4, config)) == .validated(4, []))
        #expect(await handler.handle(.save(4, config)) == .saved(4, config))
        #expect(await preferences.saves == [config])
        #expect(await availability.calls.isEmpty)
    }

    @Test func enabledValidationUsesExactRevisionAndConfiguration() async {
        let issues = [ValidationIssue(slot: .fallback, field: .credentialVariable, reason: .authentication)]
        let availability = RecordingAvailability(issues: issues)
        let handler = EffectHandler(preferences: PreferencesSpy(fails: false), availability: availability)
        let config = configuration(enabled: true)
        #expect(await handler.handle(.validate(7, config)) == .validated(7, issues))
        #expect(await availability.calls == [config])
    }

    @Test func progressAndFailuresRemainInStateWithEditsIntact() async {
        let reducer = makeReducer()
        let handler = EffectHandler(preferences: PreferencesSpy(fails: true), availability: AvailabilitySpy(issues: []))
        let given = makeState()
        let edited = reducer.reduce(given, .setEnabled(true)).0
        let (validating, effect) = reducer.reduce(edited, .validate)
        #expect(!validating.canSave && !validating.canValidate && validating.message == "validating")
        let approved = reducer.reduce(validating, await handler.handle(effect!)).0
        #expect(approved.canSave && approved.canValidate)
        let (saving, save) = reducer.reduce(approved, .save)
        #expect(!saving.canSave && !saving.canValidate && saving.message == "saving")
        let failed = reducer.reduce(saving, await handler.handle(save!)).0
        #expect(failed.draft == approved.draft && failed.saved == given.saved)
        #expect(failed.canSave && failed.canValidate && failed.saveAction == .retrySave)
        #expect(failed.showsSaveFailure && failed.statusTone == .error)
        #expect(failed.message == "saveFailed")
    }
}

@Suite struct SummarySettingsRenderTests {
    @Test func renderWritesTheShownTextAgainWithTheDependenciesAnswersNow() {
        let disclosureCalls = Mutex<[Configuration]>([])
        let reducer = Reducer(disclosure: { config in
            disclosureCalls.withLock { $0.append(config) }; return "disclosure now"
        }, message: { "message now: \($0)" }, safety: { _ in [] },
            issueMessage: { _ in "" }, runtimeDisclosure: { _ in "runtime now" })
        let given = makeState()
        assert(reducer, given, .render, delivers: nil) {
            $0.disclosure = "disclosure now"; $0.message = "message now: saved"
            $0.canValidate = true; $0.statusTone = .success
            $0.runtimes = [.init(slot: .primary, kind: .compatibleAPI, fields: [
                .init(field: .model, value: "fixture", isInvalid: false),
                .init(field: .endpoint, value: "http://127.0.0.1/v1", isInvalid: false),
                .init(field: .credentialVariable, value: "", isInvalid: false)
            ], disclosure: "runtime now"), .init(slot: .fallback, kind: .compatibleAPI, fields: [
                .init(field: .model, value: "fixture", isInvalid: false),
                .init(field: .endpoint, value: "http://127.0.0.1/v1", isInvalid: false),
                .init(field: .credentialVariable, value: "", isInvalid: false)
            ], disclosure: "runtime now")]
        }
        #expect(disclosureCalls.withLock { $0 } == [given.draft!])
    }

    @Test func renderBeforeLoadWritesOnlyTheMessage() {
        assert(makeReducer(), makeEmptyState(), .render, delivers: nil) { $0.message = "idle" }
    }
}

private func makeState() -> State {
    let config = configuration(enabled: false)
    return State(phase: .saved, draft: config, saved: config)
}
private func makeEmptyState() -> State { State() }
private func assert(_ reducer: Reducer, _ state: State, _ event: Event, delivers effect: Effect?,
                    change: (inout State) -> Void = { _ in }) {
    var expected = state; change(&expected)
    let actual = reducer.reduce(state, event)
    #expect(actual.0 == expected)
    #expect(actual.1 == effect)
}
private actor RecordingAvailability: Availability {
    let issues: [ValidationIssue]
    var calls: [Configuration] = []
    init(issues: [ValidationIssue]) { self.issues = issues }
    func validate(_ config: Configuration) -> [ValidationIssue] { calls.append(config); return issues }
}
