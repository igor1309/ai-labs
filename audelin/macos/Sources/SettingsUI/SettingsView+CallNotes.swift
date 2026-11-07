import AppKit
import GlassLedger
import SwiftUI

extension SettingsView {

    @ViewBuilder
    var callNotesPage: some View {
        switch state.callNotes {
        case let .loading(message):
            uiText(message, tokens.typeBody, tokens.gutter)
        case let .loadFailed(banner, retry):
            errorBanner(banner.title, banner.detail)
            notesButton(retry, .secondary)
        case let .loaded(draft):
            VStack(alignment: .leading, spacing: tokens.space6) {
                checkbox("Составлять итоги после звонка", isOn: draft.automatic, id: "notes-automatic") {
                    event(.setAutomaticNotes($0))
                }
                .accessibilityIdentifier("notes-automatic")
                uiText("После финальной расшифровки; запись следующего звонка не ждёт итоги.", tokens.typeSmall, tokens.sub)
                checkbox("Пробовать определить имена участников", isOn: draft.identifySpeakers, id: "notes-speakers") {
                    event(.setIdentifySpeakers($0))
                }
                .accessibilityIdentifier("notes-speakers")
            }
            ForEach(draft.runtimes) { runtime in
                runtimeCard(runtime)
            }
            uiText(draft.disclosure, tokens.typeSmall, tokens.sub)
                .fixedSize(horizontal: false, vertical: true)
            if let banner = draft.banner {
                errorBanner(banner.title, banner.detail)
            }
            HStack(spacing: tokens.space8) {
                uiText(draft.status, tokens.typeSmall, notesColor(draft.statusTone))
                    .frame(maxWidth: .infinity, alignment: .leading)
                notesButton(draft.validate, .secondary)
                notesButton(draft.save, .primary)
            }
        }
    }

    func notesColor(_ tone: SettingsState.NotesTone) -> Color {
        switch tone {
        case .secondary: tokens.gutter
        case .success: tokens.me
        case .error: tokens.rec
        }
    }

    func notesButton(_ action: SettingsState.NotesAction, _ kind: ButtonKind) -> some View {
        button(action.title, kind, isEnabled: action.isEnabled, id: "notes-\(action.id.rawValue)") { event(.notesAction(action.id)) }
            .accessibilityIdentifier("notes-\(action.id.rawValue)")
    }

    var notesFont: NSFont {
        NSFont(name: tokens.fontData, size: tokens.typeSmall) ?? .monospacedSystemFont(ofSize: tokens.typeSmall, weight: .regular)
    }

    func runtimeCard(_ runtime: SettingsState.NotesRuntime) -> some View {
        VStack(alignment: .leading, spacing: tokens.space8) {
            uiText(runtime.title, tokens.typeBody, tokens.text, .semibold)
            notesRow("Сервис") {
                SettingsNotesMenu(runtime: runtime, font: notesFont) {
                    event(.selectNotesRuntime(runtime.id, $0))
                }
            }
            ForEach(runtime.fields) { field in
                notesRow(field.label, invalid: field.isInvalid) {
                    SettingsNotesText(field: field, slot: runtime.id, slotTitle: runtime.title,
                                      font: notesFont, color: NSColor(field.isEnabled ? tokens.text : tokens.disText)) {
                        event(.editNotesField(runtime.id, field.id, $0))
                    }
                    .disabled(!field.isEnabled)
                }
            }
            uiText(runtime.disclosure, tokens.typeSmall, tokens.sub)
                .fixedSize(horizontal: false, vertical: true)
        }
        .padding(tokens.space12)
        .background(tokens.surface, in: .rect(cornerRadius: tokens.radiusCard))
        .overlay(RoundedRectangle(cornerRadius: tokens.radiusCard).strokeBorder(tokens.rule, lineWidth: 1))
    }

    func notesRow<Control: View>(_ label: String, invalid: Bool = false, @ViewBuilder control: () -> Control) -> some View {
        HStack(spacing: tokens.space12) {
            uiText(label, tokens.typeSmall, tokens.sub)
                .frame(width: config.notesLabelWidth, alignment: .leading)
            control()
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(.horizontal, tokens.space12)
                .frame(height: tokens.space24 + tokens.space6)
                .background(tokens.surface, in: .rect(cornerRadius: tokens.radiusControl))
                .overlay(RoundedRectangle(cornerRadius: tokens.radiusControl)
                    .strokeBorder(invalid ? tokens.rec : tokens.rule, lineWidth: 1))
        }
    }
}
