import SwiftUI

extension SettingsState {

    static let summaryPreviews: [(name: String, state: SettingsState)] = [
        "off", "on", "local", "invalid", "unavailable", "validating", "saving",
        "save-failed", "saved", "loading", "load-failed", "no-fallback",
    ].map { name in
        var state = release
        state.selectedTab = .callNotes
        state.callNotes = notesPreview(name)
        return ("summaries-\(name)", state)
    }

    private static func notesPreview(_ name: String) -> CallNotes {
        if name == "loading" { return .loading("Загружаем настройки…") }
        if name == "load-failed" {
            return .loadFailed(.init(title: "Не удалось загрузить настройки",
                                     detail: "Сохранённые значения не изменены. Попробуйте ещё раз."),
                               .init(id: .retryLoad, title: "Повторить"))
        }
        var draft = NotesDraft(
            automatic: name != "off", identifySpeakers: name == "on",
            runtimes: [
                .init(id: .primary, title: "Основной сервис", kind: .claudeCLI, options: notesOptions,
                      fields: [.init(id: .model, label: "Модель", value: "sonnet"),
                               .init(id: .executable, label: "Программа", value: "", placeholder: "Найти автоматически")],
                      disclosure: "Транскрипт → Anthropic · квота подписки Claude"),
                apiPreview(.fallback, title: "Резервный сервис", local: false),
            ],
            disclosure: "Выбранный сервис получает полный транскрипт. Резервный получает его только при повторе запроса.",
            status: "Есть несохранённые изменения",
            validate: .init(id: .validate, title: "Проверить"),
            save: .init(id: .save, title: "Сохранить")
        )
        switch name {
        case "no-fallback":
            draft.runtimes[1] = .init(id: .fallback, title: "Резервный сервис", kind: .unconfigured,
                                      options: [.init(id: .unconfigured, title: "Не использовать")] + notesOptions,
                                      fields: [], disclosure: "Резервный сервис не настроен. При ошибке основного сервиса итоги не будут готовы; расшифровка и аудио сохранятся.")
            draft.disclosure = "Выбранный сервис получает полный транскрипт."
        case "off": draft.status = "Автосводка выключена"
        case "local":
            draft.runtimes = [apiPreview(.primary, title: "Основной сервис", local: true),
                              apiPreview(.fallback, title: "Резервный сервис", local: true)]

        case "invalid":
            draft.runtimes[1].fields[0].value = ""
            draft.runtimes[1].fields[0].placeholder = "Название модели"
            draft.runtimes[1].fields[0].isInvalid = true
            draft.banner = .init(title: "Проверьте настройки", detail: "Укажите модель резервного сервиса.")
            draft.status = "Исправьте поле выше"
            draft.save.isEnabled = false
        case "unavailable":
            draft.banner = .init(title: "Claude Code не найден", detail: "Укажите путь к установленному CLI и проверьте снова.")
            draft.status = "Сервис недоступен"
        case "validating":
            draft.status = "Проверяем…"
            draft.save.isEnabled = false
        case "saving":
            draft.status = "Сохраняем…"
            draft.save.isEnabled = false
        case "save-failed":
            draft.banner = .init(title: "Не удалось сохранить настройки", detail: "Изменения остались в окне. Повторите попытку.")
            draft.status = "Сохранение не завершено"
            draft.save = .init(id: .retrySave, title: "Повторить")
        case "saved":
            draft.status = "Настройки сохранены"
            draft.statusTone = .success
            draft.save.isEnabled = false
        default: break
        }
        return .loaded(draft)
    }

    private static let notesOptions: [NotesRuntime.Option] = [
        .init(id: .claudeCLI, title: "Claude Code CLI"),
        .init(id: .compatibleAPI, title: "API · OpenAI-совместимый"),
    ]

    private static func apiPreview(_ slot: NotesRuntime.Slot, title: String, local: Bool) -> NotesRuntime {
        .init(id: slot, title: title, kind: .compatibleAPI, options: (slot == .fallback ? [.init(id: .unconfigured, title: "Не использовать")] : []) + notesOptions,
              fields: [
                .init(id: .model, label: "Модель", value: local ? "local-model" : "gpt-4.1-mini"),
                .init(id: .endpoint, label: "Адрес API", value: local ? "http://127.0.0.1:8080/v1" : "https://api.openai.com/v1"),
                .init(id: .credentialVariable, label: "Переменная ключа", value: local ? "" : "OPENAI_API_KEY", placeholder: "Имя переменной окружения"),
              ],
              disclosure: local
                ? "Транскрипт → сервер на этом Mac. Сервер может пересылать данные дальше."
                : "Транскрипт → api.openai.com · оплата по тарифу API")
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
