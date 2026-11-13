import Calls
import Foundation
import IMRxObservation
import Observation
import SettingsUI
import SummarySettings
import SummaryRuntime

@MainActor @Observable
public final class AudelinSettings {
    private let model: ObservableModel<SummarySettings.State, SummarySettings.Event, SummarySettings.Effect>
    public var selectedTab: SettingsState.Tab = .general
    private let text: @Sendable () -> SettingsText
    init(preferences: any SummarySettings.Preferences, availability: any SummarySettings.Availability, text: @escaping @Sendable () -> SettingsText) {
        self.text = text
        let reducer = summarySettingsReducer(text)
        let handler = SummarySettings.EffectHandler(preferences: preferences, availability: availability)
        model = ObservableModel(initialState: .init(), reduce: reducer.reduce, handleEffect: { effect in oneEvent { await handler.handle(effect) } })
        model.event(.load)
    }
    var snapshot: SummarySettings.State { model.state }
    public var notes: SettingsState.CallNotes { text().notesPresentation(model.state) }
    /// Writes the call notes text again, in the language Audelin is shown in now.
    func languageChanged() { model.event(.render) }
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

/// Call notes settings text, in the language of the Settings catalog.
extension SettingsText {
    /// The sentence a failed call operation shows; a failure `Calls` does not type keeps the system's text.
    func callsFailure(_ error: any Error) -> String {
        switch error as? CallsFailure {
        case let .notFound(id): self(.callNotFound, id)
        case let .ambiguous(id): self(.callAmbiguous, id)
        case .invalidTitle: self(.callInvalidTitle)
        case let .trashFailed(folder, reason): self(.callTrashFailed, folder, reason)
        case .sizeMismatch: self(.callSizeMismatch)
        case nil: error.localizedDescription
        }
    }

    func settingsMessage(_ phase: SummarySettings.State.Phase) -> String {
        switch phase {
        case .idle, .loading: self(.notesLoading)
        case .editing: self(.notesEditing)
        case .validating: self(.notesValidating)
        case .saving: self(.notesSaving)
        case .saved: self(.notesSaved)
        case .loadFailed: self(.notesLoadFailedMessage)
        case .saveFailed: self(.notesSaveFailedMessage)
        }
    }

    func runtimeDisclosure(_ runtime: SummarySettings.Configuration.Runtime?) -> String {
        guard let runtime else { return self(.runtimeNoFallback) }
        if runtime.kind == .claudeCLI { return self(.runtimeClaudeCLI) }
        if let url = try? SummaryRuntime.Runtime.endpoint(runtime.endpoint), SummaryRuntime.Runtime.isLoopback(url.host) {
            return self(.runtimeLoopback)
        }
        return self(.runtimeRemote, URLComponents(string: runtime.endpoint)?.host ?? self(.runtimeConfiguredAPI))
    }

    func notesDisclosure(_ config: SummarySettings.Configuration) -> String {
        self(config.fallback == nil ? .notesDisclosure : .notesDisclosureFallback)
    }

    func notesPresentation(_ state: SummarySettings.State) -> SettingsState.CallNotes {
        guard let draft = state.draft else {
            return state.phase == .loadFailed
                ? .loadFailed(.init(title: self(.notesLoadFailed), detail: state.message), .init(id: .retryLoad, title: self(.notesRetry)))
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
                             placeholder: id == .executable ? self(.findAutomatically) : id == .credentialVariable ? self(.variableName) : "",
                             isInvalid: field.isInvalid)
            }
            let title: String
            if slot == .primary { title = self(.primaryService) }
            else if value.kind == nil { title = self(.fallbackService) }
            else if fields.contains(where: \.isInvalid) { title = self(.fallbackNeedsSetup) }
            else { title = self(.fallbackService) }
            var options: [SettingsState.NotesRuntime.Option] = [
                .init(id: .claudeCLI, title: "Claude Code CLI"),
                .init(id: .compatibleAPI, title: self(.compatibleAPI)),
            ]
            if slot == .fallback { options.insert(.init(id: .unconfigured, title: self(.notUsed)), at: 0) }
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
                             banner: state.showsSaveFailure ? .init(title: self(.notesSaveFailed), detail: state.message) : nil,
                             validate: .init(id: .validate, title: self(.notesValidate), isEnabled: state.canValidate),
                             save: .init(id: state.saveAction == .retrySave ? .retrySave : .save,
                                         title: self(state.saveAction == .retrySave ? .notesRetry : .notesSave), isEnabled: state.canSave)))
    }

    func settingsFieldLabel(_ field: SummarySettings.Field) -> String {
        switch field {
        case .model: self(.modelField)
        case .executable: self(.executableField)
        case .endpoint: self(.endpointField)
        case .credentialVariable: self(.credentialField)
        }
    }

    func settingsIssueMessage(_ issue: SummarySettings.ValidationIssue) -> String {
        let slot = self(issue.slot == .primary ? .primaryService : .fallbackService)
        let detail: String
        switch issue.reason {
        case .authentication: detail = self(.issueAuthentication)
        case .unavailable: detail = self(.issueUnavailable)
        case .invalid:
            switch issue.field {
            case .model: detail = self(.issueModel)
            case .executable: detail = self(.issueExecutable)
            case .endpoint: detail = self(.issueEndpoint)
            case .credentialVariable: detail = self(.issueCredential)
            }
        }
        return self(.issueFormat, slot, settingsFieldLabel(issue.field), detail)
    }

}

/// The call notes settings machine, with its text in the language `text` gives when it writes.
func summarySettingsReducer(_ text: @escaping @Sendable () -> SettingsText) -> SummarySettings.Reducer {
    SummarySettings.Reducer(disclosure: { text().notesDisclosure($0) }, message: { text().settingsMessage($0) },
                            safety: SummaryAvailability.configurationIssues,
                            issueMessage: { text().settingsIssueMessage($0) }, runtimeDisclosure: { text().runtimeDisclosure($0) })
}
