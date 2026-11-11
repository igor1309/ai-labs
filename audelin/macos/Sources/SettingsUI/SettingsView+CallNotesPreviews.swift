import SwiftUI

extension SettingsState {

    static let summaryPreviews = summaryPreviews(in: SettingsText(language: .russian))

    /// One Call notes state per design frame, with the text the composer gives in that language.
    static func summaryPreviews(in text: SettingsText) -> [(name: String, state: SettingsState)] {
        [
            "off", "on", "local", "invalid", "unavailable", "validating", "saving",
            "save-failed", "saved", "loading", "load-failed", "no-fallback",
        ].map { name in
            var state = release(in: text)
            state.selectedTab = .callNotes
            state.callNotes = notesPreview(name, text)
            return ("summaries-\(name)", state)
        }
    }

    private static func notesPreview(_ name: String, _ text: SettingsText) -> CallNotes {
        let english = text.language == .english
        func say(_ russian: String, _ inEnglish: String) -> String { english ? inEnglish : russian }
        if name == "loading" { return .loading(text(.notesLoading)) }
        if name == "load-failed" {
            return .loadFailed(.init(title: text(.notesLoadFailed),
                                     detail: say("Сохранённые значения не изменены. Попробуйте ещё раз.", "Saved values are unchanged. Try again.")),
                               .init(id: .retryLoad, title: text(.notesRetry)))
        }
        var draft = NotesDraft(
            automatic: name != "off", identifySpeakers: name == "on",
            runtimes: [
                .init(id: .primary, title: text(.primaryService), kind: .claudeCLI, options: notesOptions(text),
                      fields: [.init(id: .model, label: text(.modelField), value: "sonnet"),
                               .init(id: .executable, label: text(.executableField), value: "", placeholder: text(.findAutomatically))],
                      disclosure: text(.runtimeClaudeCLI)),
                apiPreview(.fallback, title: text(.fallbackService), local: false, text),
            ],
            disclosure: text(.notesDisclosureFallback),
            status: text(.notesEditing),
            validate: .init(id: .validate, title: text(.notesValidate)),
            save: .init(id: .save, title: text(.notesSave))
        )
        switch name {
        case "no-fallback":
            draft.runtimes[1] = .init(id: .fallback, title: text(.fallbackService), kind: .unconfigured,
                                      options: [.init(id: .unconfigured, title: text(.notUsed))] + notesOptions(text),
                                      fields: [], disclosure: text(.runtimeNoFallback))
            draft.disclosure = text(.notesDisclosure)
        case "off": draft.status = say("Автосводка выключена", "Automatic notes are off")
        case "local":
            draft.runtimes = [apiPreview(.primary, title: text(.primaryService), local: true, text),
                              apiPreview(.fallback, title: text(.fallbackService), local: true, text)]

        case "invalid":
            draft.runtimes[1].fields[0].value = ""
            draft.runtimes[1].fields[0].placeholder = say("Название модели", "Model name")
            draft.runtimes[1].fields[0].isInvalid = true
            draft.banner = .init(title: say("Проверьте настройки", "Check the settings"),
                                 detail: say("Укажите модель резервного сервиса.", "Enter the fallback service’s model."))
            draft.status = say("Исправьте поле выше", "Correct the field above")
            draft.save.isEnabled = false
        case "unavailable":
            draft.banner = .init(title: say("Claude Code не найден", "Claude Code not found"),
                                 detail: say("Укажите путь к установленному CLI и проверьте снова.", "Enter the path to the installed CLI and check again."))
            draft.status = say("Сервис недоступен", "Service unavailable")
        case "validating":
            draft.status = text(.notesValidating)
            draft.save.isEnabled = false
        case "saving":
            draft.status = text(.notesSaving)
            draft.save.isEnabled = false
        case "save-failed":
            draft.banner = .init(title: text(.notesSaveFailed),
                                 detail: say("Изменения остались в окне. Повторите попытку.", "Your changes are still in the window. Try again."))
            draft.status = say("Сохранение не завершено", "Saving didn’t finish")
            draft.save = .init(id: .retrySave, title: text(.notesRetry))
        case "saved":
            draft.status = text(.notesSaved)
            draft.statusTone = .success
            draft.save.isEnabled = false
        default: break
        }
        return .loaded(draft)
    }

    private static func notesOptions(_ text: SettingsText) -> [NotesRuntime.Option] {
        [.init(id: .claudeCLI, title: "Claude Code CLI"), .init(id: .compatibleAPI, title: text(.compatibleAPI))]
    }

    private static func apiPreview(_ slot: NotesRuntime.Slot, title: String, local: Bool, _ text: SettingsText) -> NotesRuntime {
        .init(id: slot, title: title, kind: .compatibleAPI,
              options: (slot == .fallback ? [.init(id: .unconfigured, title: text(.notUsed))] : []) + notesOptions(text),
              fields: [
                .init(id: .model, label: text(.modelField), value: local ? "local-model" : "gpt-4.1-mini"),
                .init(id: .endpoint, label: text(.endpointField), value: local ? "http://127.0.0.1:8080/v1" : "https://api.openai.com/v1"),
                .init(id: .credentialVariable, label: text(.credentialField), value: local ? "" : "OPENAI_API_KEY", placeholder: text(.variableName)),
              ],
              disclosure: local ? text(.runtimeLoopback) : text(.runtimeRemote, "api.openai.com"))
    }
}

#Preview("summaries-off") { SettingsPreview(state: SettingsState.summaryPreviews[0].state, scheme: .light) }
#Preview("summaries-on") { SettingsPreview(state: SettingsState.summaryPreviews[1].state, scheme: .light) }
#Preview("summaries-local") { SettingsPreview(state: SettingsState.summaryPreviews[2].state, scheme: .light) }
#Preview("summaries-invalid") { SettingsPreview(state: SettingsState.summaryPreviews[3].state, scheme: .light) }
#Preview("summaries-unavailable") { SettingsPreview(state: SettingsState.summaryPreviews[4].state, scheme: .light) }
#Preview("summaries-validating") { SettingsPreview(state: SettingsState.summaryPreviews[5].state, scheme: .light) }
#Preview("summaries-saving") { SettingsPreview(state: SettingsState.summaryPreviews[6].state, scheme: .light) }
#Preview("summaries-save-failed") { SettingsPreview(state: SettingsState.summaryPreviews[7].state, scheme: .light) }
#Preview("summaries-saved") { SettingsPreview(state: SettingsState.summaryPreviews[8].state, scheme: .light) }
#Preview("summaries-loading") { SettingsPreview(state: SettingsState.summaryPreviews[9].state, scheme: .light) }
#Preview("summaries-load-failed") { SettingsPreview(state: SettingsState.summaryPreviews[10].state, scheme: .light) }

#Preview("summaries-no-fallback") { SettingsPreview(state: SettingsState.summaryPreviews[11].state, scheme: .light) }
