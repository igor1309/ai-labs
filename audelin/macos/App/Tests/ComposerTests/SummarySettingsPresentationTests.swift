import BlockingTestWork
import Foundation
import Preferences
import SummarySettings
import SummaryRuntime
import SettingsUI
import Synchronization
import Testing
@testable import Composer

@Suite struct SummarySettingsPresentationTests {
    @Test func newPreferencesUseAutomaticDiscoveryWithRussianGuidance() throws {
        let notes = NotesPreferences()
        #expect(notes.primary.kind == "claudeCLI" && notes.primary.executable.isEmpty)
        let config = try settingsConfiguration(notes)
        #expect(SummaryAvailability.configurationIssues(config).isEmpty)
        let state = settingsReducer().reduce(.init(phase: .loading), .loaded(config)).0
        let view = try loadedPresentation(state)
        let field = try #require(view.runtimes[0].fields.first { $0.id == .executable })
        #expect(field.value.isEmpty && !field.isInvalid)
        #expect(field.placeholder == "Найти автоматически")
        #expect(view.runtimes[0].disclosure == "Транскрипт → Anthropic · квота подписки Claude")
        #expect(russianSettings.settingsIssueMessage(.init(slot: .primary, field: .executable)).contains("оставьте поле пустым для автоматического поиска или укажите абсолютный путь"))
    }

    @Test func legacySavedDefaultRemainsAvailableToRuntimeRecovery() throws {
        var notes = NotesPreferences()
        notes.primary.executable = "/opt/homebrew/bin/claude"
        let saved = try JSONEncoder().encode(notes)
        let config = try settingsConfiguration(JSONDecoder().decode(NotesPreferences.self, from: saved))
        #expect(config.primary.executable == "/opt/homebrew/bin/claude")
        #expect(storedConfiguration(config) == notes)
    }

    @Test func bothSlotsDiscloseRecipientsAndCostsIncludingRemoteFallback() {
        let local = SummarySettings.Configuration.Runtime(kind: .compatibleAPI, model: "local", executable: "", endpoint: "http://127.0.0.1:8080/v1", credentialVariable: "")
        let remote = SummarySettings.Configuration.Runtime(kind: .compatibleAPI, model: "hosted", executable: "", endpoint: "https://recipient.example/v1", credentialVariable: "VARIABLE_NAME")
        let config = SummarySettings.Configuration(enabled: true, speakers: true, primary: local, fallback: remote)
        let disclosure = russianSettings.notesDisclosure(config)
        #expect(!disclosure.contains("recipient.example"))
        #expect(disclosure.contains("Резервный получает его только при повторе запроса"))
        #expect(russianSettings.runtimeDisclosure(local).contains("сервер на этом Mac"))
        #expect(russianSettings.runtimeDisclosure(remote).contains("recipient.example"))
        #expect(russianSettings.runtimeDisclosure(remote).contains("оплата по тарифу API"))
        let state = settingsReducer().reduce(.init(phase: .loading), .loaded(config)).0
        guard case let .loaded(draft) = russianSettings.notesPresentation(state) else { Issue.record("missing loaded settings"); return }
        #expect(!draft.save.isEnabled)
        #expect(draft.runtimes[1].fields.last?.value == "VARIABLE_NAME")
        #expect(draft.runtimes[0].fields.last?.value == "")
    }
    @Test func unknownStoredKindFailsInsteadOfSilentlyChangingProvider() {
        var notes = NotesPreferences()
        notes.primary.kind = "unknown-provider"
        #expect(throws: (any Error).self) { try settingsConfiguration(notes) }
    }
}


@Suite struct SummarySettingsSafetyTests {
    @Test(arguments: ["https://recipient.example/v1", "http://127.0.0.1/v1"])
    func incompleteURLRemainsEditableWhileUnsafeSavesAreBlocked(endpoint: String) throws {
        let reducer = settingsReducer()
        var state = reducer.reduce(.init(phase: .loading), .loaded(localConfiguration())).0
        for count in 0...endpoint.count {
            let proposed = String(endpoint.prefix(count))
            state = reducer.reduce(state, .editField(.fallback, .endpoint, proposed)).0
            let view = try loadedPresentation(state)
            #expect(view.runtimes[1].fields.first { $0.id == .endpoint }?.value == proposed)
            #expect(view.save.isEnabled == (state.issues.isEmpty && state.draft != state.saved))
        }
        let invalid = reducer.reduce(state, .editField(.fallback, .endpoint, "http://remote.example/v1")).0
        let field = try #require(loadedPresentation(invalid).runtimes[1].fields.first { $0.id == .endpoint })
        #expect(field.value == "http://remote.example/v1" && field.isInvalid)
    }

    @Test(arguments: [true, false])
    func providerFailuresIdentifyTheUnavailableFieldWithoutDiagnostics(cli: Bool) async throws {
        var config = localConfiguration()
        if cli {
            config.primary.kind = .claudeCLI
            config.primary.executable = "/missing/claude"
        } else {
            config.primary.credentialVariable = "MISSING_CREDENTIAL_REFERENCE"
        }
        let provider = ProviderSpy()
        let availability = SummaryAvailability(runtime: provider.runtime())
        let reducer = settingsReducer()
        let loaded = reducer.reduce(.init(phase: .loading), .loaded(config)).0
        let (validating, _) = reducer.reduce(loaded, .validate)
        let issues = await availability.validate(config)
        #expect(issues == [.init(slot: .primary, field: cli ? .executable : .credentialVariable,
                                reason: cli ? .unavailable : .authentication)])
        let result = reducer.reduce(validating, .validated(validating.revision, issues)).0
        let view = try loadedPresentation(result)
        #expect(!view.save.isEnabled && view.statusTone == .error)
        #expect(view.runtimes[0].fields.filter(\.isInvalid).map(\.id) == [cli ? .executable : .credentialVariable])
        #expect(provider.calls.withLock { $0 } == [cli ? "process: /missing/claude" : "credential: MISSING_CREDENTIAL_REFERENCE"])
    }

    @Test(arguments: ["https://user:secret@example.com/v1", "https://example.com/v1?key=secret", "https://example.com/v1#secret", "http://remote.example/v1"])
    func disabledUnsafeURLNeverReachesTemporaryPreferences(endpoint: String) async throws {
        try await withComposeFolder { root in
            let url = root.appendingPathComponent("preferences.json")
            let storage = PreferencesStore(fileURL: url)
            let preferences = SummaryPreferences(storage: storage)
            var initial = try await preferences.load()
            initial.fallback = .init(kind: .compatibleAPI, model: "fixture", executable: "", endpoint: "https://api.example.com/v1", credentialVariable: "KEY")
            try await preferences.save(initial)
            let before = try Data(contentsOf: url)
            let provider = ProviderSpy()
            let handler = EffectHandler(preferences: preferences, availability: SummaryAvailability(runtime: provider.runtime()))
            let reducer = settingsReducer()
            let loaded = reducer.reduce(.init(phase: .loading), .loaded(initial)).0
            let edited = reducer.reduce(loaded, .editField(.fallback, .endpoint, endpoint)).0
            #expect(edited.draft?.enabled == false)
            let (rejected, save) = reducer.reduce(edited, .save)
            #expect(save == nil)
            #expect(rejected.issues.map(\.slot) == [.fallback])
            #expect(rejected.issues.map(\.field) == [.endpoint])
            let view = try loadedPresentation(rejected)
            #expect(!view.save.isEnabled && view.statusTone == .error)
            #expect(view.runtimes[1].fields.first { $0.id == .endpoint }?.isInvalid == true)
            #expect(!String(describing: view).contains("secret"))
            // The persistence boundary also rejects a caller bypassing the reducer.
            let unsafe = try #require(edited.draft)
            #expect(await handler.handle(.save(edited.revision, unsafe)) == .saveFailed(edited.revision))
            #expect(try Data(contentsOf: url) == before)
            #expect(try await preferences.load() == initial)
            #expect(provider.calls.withLock { $0.isEmpty })
        }
    }

    @Test func disabledSafeSaveAndValidationNeedNoInstalledOrAuthenticatedProvider() async throws {
        try await withComposeFolder { root in
            let url = root.appendingPathComponent("preferences.json")
            let storage = PreferencesStore(fileURL: url)
            let preferences = SummaryPreferences(storage: storage)
            let config = try await preferences.load()
            let provider = ProviderSpy()
            let handler = EffectHandler(preferences: preferences, availability: SummaryAvailability(runtime: provider.runtime()))
            let reducer = settingsReducer()
            let loaded = reducer.reduce(.init(phase: .loading), .loaded(config)).0
            let edited = reducer.reduce(loaded, .editField(.primary, .executable, "/missing/claude")).0
            let (validating, validate) = reducer.reduce(edited, .validate)
            let validated = reducer.reduce(validating, await handler.handle(try #require(validate))).0
            let (saving, save) = reducer.reduce(validated, .save)
            #expect(!saving.canSave && !saving.canValidate)
            let saved = reducer.reduce(saving, await handler.handle(try #require(save))).0
            #expect(saved.saved == edited.draft && saved.phase == .saved)
            let reloaded = try await SummaryPreferences(storage: PreferencesStore(fileURL: url)).load()
            #expect(reloaded.primary.executable == "/missing/claude" && !reloaded.enabled)
            #expect(provider.calls.withLock { $0.isEmpty })
        }
    }

    @Test func realValidationIdentifiesFallbackModelAndValidEditsClearTheIssue() async throws {
        let config = localConfiguration()
        let reducer = settingsReducer()
        let provider = ProviderSpy()
        let availability = SummaryAvailability(runtime: provider.runtime())
        let loaded = reducer.reduce(.init(phase: .loading), .loaded(config)).0
        let edited = reducer.reduce(loaded, .editField(.fallback, .model, "")).0
        let (rejected, effect) = reducer.reduce(edited, .validate)
        #expect(effect == nil)
        #expect(await availability.validate(try #require(edited.draft)) == [.init(slot: .fallback, field: .model)])
        let view = try loadedPresentation(rejected)
        #expect(!view.save.isEnabled && view.statusTone == .error)
        #expect(view.status == "Резервный сервис · Модель: укажите модель.")
        #expect(view.runtimes[1].fields.filter(\.isInvalid).map(\.id) == [.model])
        #expect(view.runtimes[0].fields.allSatisfy { !$0.isInvalid })
        let corrected = reducer.reduce(rejected, .editField(.fallback, .model, "corrected-model")).0
        let correction = try loadedPresentation(corrected)
        #expect(corrected.issues.isEmpty && corrected.validatedRevision == nil)
        #expect(correction.runtimes.flatMap(\.fields).allSatisfy { !$0.isInvalid })
        #expect(correction.status == russianSettings.settingsMessage(.editing))
        #expect(correction.save.isEnabled && correction.validate.isEnabled)
        #expect(provider.calls.withLock { $0.isEmpty })
    }

    @Test func enabledValidationAndSaveRemainBoundToTheEditedRevision() async throws {
        try await withComposeFolder { root in
            let preferences = SummaryPreferences(storage: PreferencesStore(fileURL: root.appendingPathComponent("preferences.json")))
            let provider = ProviderSpy()
            let handler = EffectHandler(preferences: preferences, availability: SummaryAvailability(runtime: provider.runtime()))
            let reducer = settingsReducer()
            let loaded = reducer.reduce(.init(phase: .loading), .loaded(localConfiguration())).0
            let edited = reducer.reduce(loaded, .editField(.fallback, .model, "first-model")).0
            let (validating, validate) = reducer.reduce(edited, .validate)
            let oldResult = await handler.handle(try #require(validate))
            let newer = reducer.reduce(validating, .editField(.fallback, .model, "latest-model")).0
            #expect(reducer.reduce(newer, oldResult).0 == newer)
            #expect(newer.canSave)
            #expect(try loadedPresentation(newer).save.isEnabled)
            let (checking, latest) = reducer.reduce(newer, .save)
            #expect(latest == .validate(newer.revision, newer.draft!))
            let (saving, save) = reducer.reduce(checking, await handler.handle(try #require(latest)))
            #expect(save == .save(newer.revision, newer.draft!))
            #expect(reducer.reduce(saving, .save).1 == nil)
            let saved = reducer.reduce(saving, await handler.handle(try #require(save))).0
            let view = try loadedPresentation(saved)
            #expect(saved.phase == .saved && view.statusTone == .success && !view.save.isEnabled)
            #expect(try await preferences.load() == newer.draft)
        }
    }

    @Test func clearingFallbackRemovesItsErrorsAndSavesPrimaryOnly() async throws {
        try await withComposeFolder { root in
            var config = localConfiguration()
            config.fallback?.endpoint = "https://api.example.com/v1"
            config.fallback?.credentialVariable = "MISSING_KEY"
            let provider = ProviderSpy()
            let availability = SummaryAvailability(runtime: provider.runtime())
            #expect(await availability.validate(config) == [.init(slot: .fallback, field: .credentialVariable, reason: .authentication)])
            let reducer = settingsReducer()
            let loaded = reducer.reduce(.init(phase: .loading), .loaded(config)).0
            let cleared = reducer.reduce(loaded, .selectKind(.fallback, nil)).0
            let view = try loadedPresentation(cleared)
            #expect(view.runtimes[1].title == "Резервный сервис")
            #expect(view.runtimes[1].kind == .unconfigured && view.runtimes[1].fields.isEmpty)
            #expect(view.runtimes[1].options.first?.id == .unconfigured)
            #expect(!view.runtimes[0].options.contains { $0.id == .unconfigured })
            #expect(!view.disclosure.contains("Оба сервиса"))
            #expect(cleared.canSave && cleared.issues.isEmpty)
            let preferences = SummaryPreferences(storage: PreferencesStore(fileURL: root.appendingPathComponent("preferences.json")))
            let handler = EffectHandler(preferences: preferences, availability: availability)
            let (checking, check) = reducer.reduce(cleared, .save)
            let (saving, save) = reducer.reduce(checking, await handler.handle(try #require(check)))
            let saved = reducer.reduce(saving, await handler.handle(try #require(save))).0
            #expect(saved.phase == .saved)
            #expect(try await preferences.load() == cleared.draft)
            #expect(try await preferences.load().fallback == nil)
        }
    }

    @Test func unsafeStoredValuesFailLoadWithoutEchoingOrReplacingData() async throws {
        try await withComposeFolder { root in
            let url = root.appendingPathComponent("preferences.json")
            var stored = Preferences()
            stored.notes.fallback = .init(kind: "compatibleAPI", model: "fixture", executable: "", endpoint: "", credentialVariable: "")
            stored.notes.fallback?.endpoint = "https://user:secret@example.com/v1?key=secret"
            let data = try JSONEncoder().encode(stored)
            try data.write(to: url)
            let preferences = SummaryPreferences(storage: PreferencesStore(fileURL: url))
            let provider = ProviderSpy()
            let handler = EffectHandler(preferences: preferences, availability: SummaryAvailability(runtime: provider.runtime()))
            let reducer = settingsReducer()
            let (loading, load) = reducer.reduce(.init(), .load)
            let result = reducer.reduce(loading, await handler.handle(try #require(load))).0
            #expect(result.phase == .loadFailed && result.draft == nil)
            #expect(!String(describing: russianSettings.notesPresentation(result)).contains("secret"))
            #expect(try Data(contentsOf: url) == data)
        }
    }

    @Test func translationUsesMachineActionsAndRenderedFieldsWithoutDerivingPolicy() throws {
        let reducer = settingsReducer()
        var state = reducer.reduce(.init(phase: .loading), .loaded(localConfiguration())).0
        state.canSave = true; state.canValidate = false; state.saveAction = .retrySave
        state.statusTone = .error; state.showsSaveFailure = true
        state.runtimes[1].fields[0].isInvalid = true
        state.runtimes[1].fields[0].value = "rendered model"
        let view = try loadedPresentation(state)
        #expect(view.save.isEnabled && !view.validate.isEnabled && view.save.id == .retrySave)
        #expect(view.statusTone == .error && view.banner != nil)
        #expect(view.runtimes[1].fields[0].isInvalid && view.runtimes[1].fields[0].value == "rendered model")
    }
}

private func settingsReducer() -> Reducer {
    summarySettingsReducer { russianSettings }
}
private func localConfiguration() -> SummarySettings.Configuration {
    let runtime = SummarySettings.Configuration.Runtime(kind: .compatibleAPI, model: "fixture", executable: "", endpoint: "http://127.0.0.1/v1", credentialVariable: "")
    return .init(enabled: true, speakers: true, primary: runtime, fallback: runtime)
}
private func loadedPresentation(_ state: SummarySettings.State) throws -> SettingsState.NotesDraft {
    guard case let .loaded(draft) = russianSettings.notesPresentation(state) else { throw PresentationFailure.missing }
    return draft
}
private enum PresentationFailure: Error { case missing }
private final class ProviderSpy: ProcessRunning, HTTPRequesting, Sendable {
    let calls = Mutex<[String]>([])
    func runtime() -> SummaryRuntime.Runtime {
        .init(process: self, http: self, credential: { name in
            self.calls.withLock { $0.append("credential: " + name) }; return nil
        }, resolveProgram: { $0 }, deadline: { throw SummaryRuntime.Failure.timeout })
    }
    func run(program: String, arguments: [String], input: Data) throws -> ProcessOutput {
        calls.withLock { $0.append("process: " + program) }; throw SummaryRuntime.Failure.unavailable
    }
    func request(url: URL, headers: [String: String], body: Data, loopback: Bool) throws -> HTTPResponse {
        calls.withLock { $0.append("HTTP") }; throw SummaryRuntime.Failure.transport
    }
}

let russianSettings = SettingsText(language: .russian)

struct SummarySettingsEnglishTextTests {
    @Test func messagesAndDisclosuresComeInTheGivenLanguage() {
        let english = SettingsText(language: .english)
        #expect(english.settingsMessage(.saved) == "Settings saved")
        #expect(english.runtimeDisclosure(nil).hasPrefix("No fallback service is set up."))
        #expect(russianSettings.runtimeDisclosure(nil).hasPrefix("Резервный сервис не настроен."))
        let issue = SummarySettings.ValidationIssue(slot: .fallback, field: .model)
        #expect(english.settingsIssueMessage(issue) == "Fallback Service · Model: enter a model.")
        #expect(russianSettings.settingsIssueMessage(issue) == "Резервный сервис · Модель: укажите модель.")
    }
}
