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
        let reducer = SummarySettings.Reducer(disclosure: notesDisclosure, message: settingsMessage)
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
        case let .selectNotesRuntime(slot, kind): model.event(.selectKind(slot == .primary ? .primary : .fallback, .init(rawValue: kind.rawValue)!))
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
    if runtime.kind == .claudeCLI { return "Квота подписки Claude · транскрипт → Anthropic. Изоляция исключает настройки пользователя; политики организации сохраняются." }
    if let url = try? SummaryRuntime.Runtime.endpoint(runtime.endpoint), SummaryRuntime.Runtime.isLoopback(url.host) {
        return "Запрос на этот Mac · локальные вычисления. Сервер под вашим управлением может пересылать данные дальше."
    }
    return "Оплата API по токенам · транскрипт → \(safeRecipient(runtime.endpoint)). Сохраняется только имя переменной учётных данных."
}
private func safeRecipient(_ endpoint: String) -> String { URLComponents(string: endpoint)?.host ?? "настроенный API" }
func notesDisclosure(_ config: SummarySettings.Configuration) -> String {
    "Основной: " + runtimeDisclosure(config.primary) + "\nРезервный: " + runtimeDisclosure(config.fallback)
    + "\nОба сервиса могут получить полный транскрипт. Определение имён — дополнительный запрос. Таймаут тоже может расходовать квоту или деньги. Проверка не отправляет транскрипт и не подтверждает квоту."
}
func notesPresentation(_ state: SummarySettings.State) -> SettingsState.CallNotes {
    guard let draft = state.draft else {
        return state.phase == .loadFailed
            ? .loadFailed(.init(title: "Не удалось загрузить настройки", detail: state.message), .init(id: .retryLoad, title: "Повторить"))
            : .loading(state.message)
    }
    func runtime(_ value: SummarySettings.Configuration.Runtime, _ slot: SettingsState.NotesRuntime.Slot) -> SettingsState.NotesRuntime {
        var fields: [SettingsState.NotesField] = [.init(id: .model, label: "Модель", value: value.model)]
        if value.kind == .claudeCLI { fields.append(.init(id: .executable, label: "Программа", value: value.executable)) }
        else {
            fields += [.init(id: .endpoint, label: "Адрес API", value: value.endpoint),
                       .init(id: .credentialVariable, label: "API-ключ из", value: value.credentialVariable, placeholder: "не требуется")]
        }
        return .init(id: slot, title: slot == .primary ? "Основной сервис" : "Резервный сервис", kind: .init(rawValue: value.kind.rawValue)!,
                     options: [.init(id: .claudeCLI, title: "Claude Code CLI"), .init(id: .compatibleAPI, title: "API · OpenAI-совместимый")],
                     fields: fields, disclosure: runtimeDisclosure(value))
    }
    let busy = state.savingRevision != nil || state.phase == .validating
    let canSave = !busy && draft != state.saved && (!draft.enabled || state.validatedRevision == state.revision)
    return .loaded(.init(automatic: draft.enabled, identifySpeakers: draft.speakers,
                         runtimes: [runtime(draft.primary, .primary), runtime(draft.fallback, .fallback)],
                         disclosure: state.disclosure, status: state.message,
                         statusTone: state.phase == .saved ? .success : .secondary,
                         banner: state.phase == .saveFailed ? .init(title: "Не удалось сохранить настройки", detail: state.message) : nil,
                         validate: .init(id: .validate, title: "Проверить", isEnabled: !busy),
                         save: .init(id: state.phase == .saveFailed ? .retrySave : .save,
                                     title: state.phase == .saveFailed ? "Повторить" : "Сохранить", isEnabled: canSave)))
}
