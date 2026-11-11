import GlassLedger
import SwiftUI

public struct CallsListView: View {
    private let state: CallsListState
    private let event: (CallsListEvent) -> Void
    @Environment(\.colorScheme) private var scheme
    @State private var hovered: String?
    @FocusState private var editing: Bool
    private var tokens: GlassLedger { .for(scheme) }

    public init(state: CallsListState, event: @escaping (CallsListEvent) -> Void) {
        self.state = state
        self.event = event
    }

    public var body: some View {
        VStack(spacing: 0) {
            ScrollView {
                LazyVStack(spacing: 0) {
                    ForEach(state.rows) { row in
                        if let day = row.day { dayHeader(day) }
                        callRow(row)
                    }
                    if state.rows.isEmpty {
                        Text(state.busy ? "Загружаются звонки…" : "Пока нет записанных звонков")
                            .foregroundStyle(tokens.gutter).padding(tokens.space24)
                    }
                }
            }
            if let failure = state.failure {
                Text(failure)
                    .font(tokens.ui(tokens.typeSmall))
                    .foregroundStyle(tokens.rec)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(tokens.space16)
                    .background(tokens.errBg)
                    .accessibilityIdentifier("calls.failure")
            }
        }
        .font(tokens.ui(tokens.typeSmall))
        .background(tokens.win)
        .focusable()
        .focusEffectDisabled()
        .onKeyPress(keys: [.downArrow, .upArrow]) { press in
            event(press.key == .downArrow ? .selectNext : .selectPrevious)
            return .handled
        }
        .onKeyPress(keys: [.return, .space, "r", .delete, .backspace]) { press in
            guard let row = state.rows.first(where: { $0.id == state.selectedID }),
                  let action = keyAction(press, row) else { return .ignored }
            event(action)
            return .handled
        }
        .overlay { if let body = state.deleteBody { deleteAlert(body) } }
        .onChange(of: state.editing?.id) { _, id in editing = id != nil }
        .onAppear { GlassLedger.registerFonts(); editing = state.editing != nil }
    }

    /// The whole row is a button that selects it; the title, the eye and the
    /// actions inside it take their own clicks.
    private func callRow(_ row: CallsListState.Row) -> some View {
        Button { event(.select(row.id)) } label: { rowContent(row).contentShape(.rect) }
            .buttonStyle(.plain)
            .simultaneousGesture(TapGesture(count: 2).onEnded { if !state.busy { event(.open(row.id)) } })
            .contextMenu { menu(row) }
    }

    /// The row's actions, the same in its context menu and on its keys.
    @ViewBuilder private func menu(_ row: CallsListState.Row) -> some View {
        Button("Открыть") { event(.open(row.id)) }.disabled(state.busy)
        if row.hasNotes { Button("Показать заметки") { event(.preview(row.id)) } }
        Button("Переименовать") { event(.select(row.id)); event(.beginRename(row.id)) }
            .disabled(!row.editable || state.busy)
        if row.canRetrySummary { Button("Повторить итоги") { event(.retrySummary(row.id)) }.disabled(state.busy) }
        Divider()
        Button("Удалить…", role: .destructive) { event(.askDelete(row.id)) }.disabled(!row.editable || state.busy)
    }

    /// Return opens, Space shows notes, ⌘R renames and ⌘⌫ asks to delete the selected call.
    private func keyAction(_ press: KeyPress, _ row: CallsListState.Row) -> CallsListEvent? {
        let command = press.modifiers.contains(.command)
        switch press.key {
        case .return where !command && !state.busy: return .open(row.id)
        case .space where !command && row.hasNotes: return .preview(row.id)
        case "r" where command && row.editable && !state.busy: return .beginRename(row.id)
        case .delete where command && row.editable && !state.busy, .backspace where command && row.editable && !state.busy: return .askDelete(row.id)
        default: return nil
        }
    }

    /// One line at a fixed height: start time, title, duration and the status cell.
    private func rowContent(_ row: CallsListState.Row) -> some View {
        HStack(spacing: tokens.space12) {
            Text(row.time).font(tokens.data(tokens.typeSmall)).foregroundStyle(tokens.gutter)
                .frame(width: timeWidth, alignment: .leading).allowsHitTesting(false)
            Group {
                if let edit = state.editing, edit.id == row.id {
                    HStack(spacing: 0) {
                        Text(row.id + " ").font(tokens.data(tokens.typeSmall)).foregroundStyle(tokens.gutter)
                        TextField("Название", text: Binding(get: { edit.title }, set: { event(.editTitle($0)) }))
                            .textFieldStyle(.plain)
                            .focused($editing)
                            .onSubmit { event(.submitRename) }
                            .onExitCommand { event(.cancelRename) }
                    }
                    .padding(.horizontal, tokens.space4)
                    .background(tokens.surface, in: .rect(cornerRadius: tokens.radiusControl))
                    .overlay(RoundedRectangle(cornerRadius: tokens.radiusControl).stroke(tokens.me, lineWidth: 1.5))
                } else {
                    Button { event(.select(row.id)); event(.beginRename(row.id)) } label: {
                        title(row).frame(maxWidth: .infinity, alignment: .leading).contentShape(.rect)
                    }
                    .buttonStyle(.plain).disabled(!row.editable || state.busy)
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            Text(row.duration).font(tokens.data(tokens.typeSmall)).foregroundStyle(tokens.sub)
                .frame(width: cellWidth, alignment: .trailing).allowsHitTesting(false)
            HStack(spacing: tokens.space6) {
                summary(row)
                eye(row)
            }
            .frame(width: cellWidth, alignment: .trailing)
        }
        .lineLimit(1)
        .frame(height: rowHeight)
        .padding(.horizontal, tokens.space16)
        .background(state.selectedID == row.id ? tokens.okBg : .clear)
        .background(hovered == row.id ? tokens.card : tokens.surface)
        .accessibilityAddTraits(state.selectedID == row.id ? .isSelected : [])
        .onHover { hovered = $0 ? row.id : nil }
    }

    /// The title on one line, cut with an ellipsis; an untitled call shows its folder name.
    private func title(_ row: CallsListState.Row) -> some View {
        Text(row.displayTitle)
            .font(row.title.isEmpty ? tokens.data(tokens.typeSmall) : tokens.ui(tokens.typeSmall, .semibold))
            .foregroundStyle(row.title.isEmpty ? tokens.gutter : tokens.text)
            .truncationMode(.tail)
    }

    /// A spinner while the summary is prepared, a red mark when it failed.
    @ViewBuilder private func summary(_ row: CallsListState.Row) -> some View {
        switch row.summary {
        case .none: EmptyView()
        case .pending:
            ProgressView().controlSize(.mini).frame(width: iconSize, height: iconSize)
                .help(row.summaryStatus).accessibilityLabel(row.summaryStatus)
                .accessibilityIdentifier("calls.summary.\(row.id)")
        case .failed:
            Image(systemName: "exclamationmark.circle").font(tokens.ui(tokens.typeSmall, .semibold)).foregroundStyle(tokens.rec)
                .frame(width: iconSize, height: iconSize)
                .help(row.summaryStatus).accessibilityLabel(row.summaryStatus)
                .accessibilityIdentifier("calls.summary.\(row.id)")
        }
    }

    private func dayHeader(_ day: CallsListState.Row.Day) -> some View {
        HStack(spacing: tokens.space8) {
            Text(day.title).font(tokens.ui(tokens.typeCaption, .semibold)).foregroundStyle(tokens.sub)
            Text(day.count).font(tokens.ui(tokens.typeCaption)).foregroundStyle(tokens.gutter)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.horizontal, tokens.space16).padding(.top, tokens.space12).padding(.bottom, tokens.space4)
        .background(tokens.win)
    }

    private let timeWidth: CGFloat = 40
    private let cellWidth: CGFloat = 64
    private let iconSize: CGFloat = 14
    private var rowHeight: CGFloat { tokens.space28 }

    /// The eye a call with notes shows; a call without keeps its place empty.
    @ViewBuilder private func eye(_ row: CallsListState.Row) -> some View {
        if row.hasNotes {
            let previewed = state.previewedID == row.id
            Button { event(.preview(row.id)) } label: {
                Image(systemName: "eye")
                    .font(tokens.ui(tokens.typeSmall, .semibold))
                    .foregroundStyle(state.selectedID == row.id ? tokens.me : tokens.sub)
                    .frame(width: iconSize, height: iconSize)
                    .contentShape(.rect)
            }
            .buttonStyle(.plain)
            .help("Показать заметки")
            .accessibilityLabel("Показать заметки")
            .accessibilityAddTraits(previewed ? .isSelected : [])
            .accessibilityIdentifier("calls.eye.\(row.id)")
        } else {
            EmptyView()
        }
    }

    private func button(_ title: String, destructive: Bool, action: @escaping () -> Void) -> some View {
        Button(role: destructive ? .destructive : nil, action: action) {
            Text(title).font(tokens.ui(tokens.typeSmall, .semibold))
                .foregroundStyle(destructive ? tokens.rec : tokens.text)
                .padding(.vertical, tokens.space6).padding(.horizontal, tokens.space12)
                .frame(maxWidth: .infinity)
                .background(destructive ? tokens.errBg : tokens.btn, in: .rect(cornerRadius: tokens.radiusControl))
        }.buttonStyle(.plain)
    }

    private func deleteAlert(_ body: String) -> some View {
        ZStack {
            tokens.shadow
            VStack(alignment: .leading, spacing: tokens.space12) {
                Text("!").font(tokens.ui(tokens.typeTitle, .semibold)).foregroundStyle(tokens.warn)
                    .frame(width: 40, height: 40)
                    .background(tokens.warnBg, in: .rect(cornerRadius: tokens.radiusCard))
                Text("Удалить звонок?").font(tokens.ui(tokens.typeTitle, .semibold)).foregroundStyle(tokens.text)
                Text(body).font(tokens.ui(tokens.typeSmall)).foregroundStyle(tokens.sub).fixedSize(horizontal: false, vertical: true)
                VStack(spacing: tokens.space8) {
                    button("Удалить", destructive: true) { event(.confirmDelete) }
                        .disabled(state.rows.first(where: { $0.id == state.deleteID })?.editable != true)
                    button("Отмена", destructive: false) { event(.cancelDelete) }.keyboardShortcut(.cancelAction)
                }
            }
            .padding(tokens.space24).frame(width: 340)
            .background(tokens.win, in: .rect(cornerRadius: tokens.radiusCard))
            .shadow(color: tokens.shadow, radius: 16, y: 12)
            .onExitCommand { event(.cancelDelete) }
        }
    }
}

/// What the ⌫ key types; SwiftUI's `.delete` is U+0008, which a Mac keyboard does not send.
private extension KeyEquivalent { static let backspace = KeyEquivalent("\u{7F}") }
