import Foundation
import IMRxObservation
import Observation
import SettingsUI
import SummarySettings
import SummaryRuntime

@MainActor @Observable
public final class AudelinSettings {
    private let model: ObservableModel<SummarySettings.State, SummarySettings.Event, SummarySettings.Effect>
    public var selectedTab: SettingsState.Tab = .recording
    init(preferences: any SummarySettings.Preferences, availability: any SummarySettings.Availability) {
        let reducer = SummarySettings.Reducer(disclosure: notesDisclosure, message: settingsMessage, safety: SummaryAvailability.configurationIssues,
                                              issueMessage: settingsIssueMessage, runtimeDisclosure: runtimeDisclosure)
        let handler = SummarySettings.EffectHandler(preferences: preferences, availability: availability)
        model = ObservableModel(initialState: .init(), reduce: reducer.reduce, handleEffect: { effect in
            AsyncStream { output in
                let task = Task { output.yield(await handler.handle(effect)); output.finish() }
                output.onTermination = { _ in task.cancel() }
            }
        })
        model.event(.load)
    }
    var snapshot: SummarySettings.State { model.state }
    public var notes: SettingsState.CallNotes { notesPresentation(model.state) }
    public func send(_ event: SettingsEvent) {
        if case let .selectTab(tab) = event { selectedTab = tab; return }
        if case let .notesAction(action) = event {
            switch action {
            case .retryLoad: model.event(.load)
            case .validate: model.event(.validate)
            case .save, .retrySave: model.event(.save)
            }
            return
        }
        switch event {
        case let .setAutomaticNotes(value): model.event(.setEnabled(value))
        case let .setIdentifySpeakers(value): model.event(.setSpeakers(value))
        case let .selectNotesRuntime(slot, kind): model.event(.selectKind(slot == .primary ? .primary : .fallback, SummarySettings.Configuration.Runtime.Kind(rawValue: kind.rawValue)))
        case let .editNotesField(slot, field, value):
            let key: SummarySettings.Field
            switch field {
            case .model: key = .model
            case .executable: key = .executable
            case .endpoint: key = .endpoint
            case .credentialVariable: key = .credentialVariable
            }
            model.event(.editField(slot == .primary ? .primary : .fallback, key, value))
        default: break
        }
    }
}

func settingsMessage(_ phase: SummarySettings.State.Phase) -> String {
    switch phase {
    case .idle, .loading: "Загружаем настройки…"
    case .editing: "Есть несохранённые изменения"
    case .validating: "Проверяем…"
    case .saving: "Сохраняем…"
    case .saved: "Настройки сохранены"
    case .loadFailed: "Не удалось загрузить настройки. Сохранённые значения не изменены."
    case .saveFailed: "Не удалось сохранить настройки. Изменения остались в окне."
    }
}
func runtimeDisclosure(_ runtime: SummarySettings.Configuration.Runtime) -> String {
    if runtime.kind == .claudeCLI { return "Пустое поле «Программа» — автоматический поиск Claude в PATH и стандартных папках установки. Для другой установки укажите абсолютный путь. Квота подписки Claude · транскрипт → Anthropic. Изоляция исключает настройки пользователя; политики организации сохраняются." }
    if let url = try? SummaryRuntime.Runtime.endpoint(runtime.endpoint), SummaryRuntime.Runtime.isLoopback(url.host) {
        return "Запрос на этот Mac · локальные вычисления. Сервер под вашим управлением может пересылать данные дальше."
    }
    return "Оплата API по токенам · транскрипт → \(safeRecipient(runtime.endpoint)). Сохраняется только имя переменной учётных данных."
}
private func safeRecipient(_ endpoint: String) -> String { URLComponents(string: endpoint)?.host ?? "настроенный API" }
func notesDisclosure(_ config: SummarySettings.Configuration) -> String {
    let fallback = config.fallback.map { "Резервный: " + runtimeDisclosure($0) } ?? "Резервный сервис не настроен."
    let recipients = config.fallback == nil ? "Основной сервис может получить полный транскрипт." : "Оба сервиса могут получить полный транскрипт."
    return "Основной: " + runtimeDisclosure(config.primary) + "\n" + fallback
    + "\n" + recipients + " Определение имён — дополнительный запрос. Таймаут тоже может расходовать квоту или деньги. Проверка не отправляет транскрипт и не подтверждает квоту."
}
func notesPresentation(_ state: SummarySettings.State) -> SettingsState.CallNotes {
    guard let draft = state.draft else {
        return state.phase == .loadFailed
            ? .loadFailed(.init(title: "Не удалось загрузить настройки", detail: state.message), .init(id: .retryLoad, title: "Повторить"))
            : .loading(state.message)
    }
    func runtime(_ value: SummarySettings.RenderedRuntime) -> SettingsState.NotesRuntime {
        let slot: SettingsState.NotesRuntime.Slot = value.slot == .primary ? .primary : .fallback
        let fields: [SettingsState.NotesField] = value.fields.map { field in
            let id: SettingsState.NotesField.ID
            switch field.field {
            case .model: id = .model
            case .executable: id = .executable
            case .endpoint: id = .endpoint
            case .credentialVariable: id = .credentialVariable
            }
            return .init(id: id, label: settingsFieldLabel(field.field), value: field.value,
                         placeholder: id == .executable ? "Автоматически найти Claude" : id == .credentialVariable ? "не требуется" : "", isInvalid: field.isInvalid)
        }
        let title: String
        if slot == .primary { title = "Основной сервис" }
        else if value.kind == nil { title = "Резервный сервис · не настроен" }
        else if fields.contains(where: \.isInvalid) { title = "Резервный сервис · требует настройки" }
        else { title = "Резервный сервис · настроен" }
        var options: [SettingsState.NotesRuntime.Option] = [
            .init(id: .claudeCLI, title: "Claude Code CLI"),
            .init(id: .compatibleAPI, title: "API · OpenAI-совместимый"),
        ]
        if slot == .fallback { options.insert(.init(id: .unconfigured, title: "Не настроен (необязательно)"), at: 0) }
        return .init(id: slot, title: title, kind: value.kind.flatMap { .init(rawValue: $0.rawValue) } ?? .unconfigured,
                     options: options, fields: fields, disclosure: value.disclosure)
    }
    let tone: SettingsState.NotesTone
    switch state.statusTone {
    case .secondary: tone = .secondary
    case .success: tone = .success
    case .error: tone = .error
    }
    return .loaded(.init(automatic: draft.enabled, identifySpeakers: draft.speakers,
                         runtimes: state.runtimes.map(runtime),
                         disclosure: state.disclosure, status: state.message, statusTone: tone,
                         banner: state.showsSaveFailure ? .init(title: "Не удалось сохранить настройки", detail: state.message) : nil,
                         validate: .init(id: .validate, title: "Проверить", isEnabled: state.canValidate),
                         save: .init(id: state.saveAction == .retrySave ? .retrySave : .save,
                                     title: state.saveAction == .retrySave ? "Повторить" : "Сохранить", isEnabled: state.canSave)))
}

func settingsFieldLabel(_ field: SummarySettings.Field) -> String {
    switch field {
    case .model: "Модель"
    case .executable: "Программа"
    case .endpoint: "Адрес API"
    case .credentialVariable: "API-ключ из"
    }
}
func settingsIssueMessage(_ issue: SummarySettings.ValidationIssue) -> String {
    let slot = issue.slot == .primary ? "Основной сервис" : "Резервный сервис"
    let detail: String
    switch issue.reason {
    case .authentication:
        detail = "переменная учётных данных недоступна приложению; проверьте имя. Значение не показывается."
    case .unavailable:
        detail = "сервис недоступен или не поддерживает изоляцию. Проверка не подтверждает квоту."
    case .invalid:
        switch issue.field {
        case .model: detail = "укажите модель."
        case .executable: detail = "оставьте поле пустым для автоматического поиска или укажите абсолютный путь к программе."
        case .endpoint: detail = "укажите HTTPS или loopback HTTP без логина, пароля, параметров и фрагмента."
        case .credentialVariable: detail = "укажите только имя переменной учётных данных, без её значения."
        }
    }
    return slot + " · " + settingsFieldLabel(issue.field) + ": " + detail
}
