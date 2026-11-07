import Foundation
import Preferences
import SummarySettings
import Testing
@testable import Composer

@Suite struct SummarySettingsPresentationTests {
    @Test func bothSlotsDiscloseRecipientsAndCostsIncludingRemoteFallback() {
        let local = Configuration.Runtime(kind: .compatibleAPI, model: "local", executable: "", endpoint: "http://127.0.0.1:8080/v1", credentialVariable: "")
        let remote = Configuration.Runtime(kind: .compatibleAPI, model: "hosted", executable: "", endpoint: "https://recipient.example/v1", credentialVariable: "VARIABLE_NAME")
        let config = Configuration(enabled: true, speakers: true, primary: local, fallback: remote)
        let disclosure = notesDisclosure(config)
        #expect(disclosure.contains("Основной:") && disclosure.contains("Резервный:"))
        #expect(disclosure.contains("локальные вычисления"))
        #expect(disclosure.contains("Оплата API по токенам"))
        #expect(disclosure.contains("recipient.example"))
        #expect(disclosure.contains("Оба сервиса могут получить полный транскрипт"))
        let state = SummarySettings.State(phase: .saved, draft: config, saved: config, disclosure: disclosure)
        guard case let .loaded(draft) = notesPresentation(state) else { Issue.record("missing loaded settings"); return }
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
