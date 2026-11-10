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
            HStack(spacing: tokens.space12) {
                Text("Дата").frame(width: 130, alignment: .leading)
                Text("Звонок").frame(maxWidth: .infinity, alignment: .leading)
                Text("Длит.").frame(width: 80, alignment: .leading)
                Color.clear.frame(width: eyeWidth, height: 1)
                Color.clear.frame(width: 170, height: 1)
            }
            .font(tokens.ui(tokens.typeCaption, .semibold))
            .foregroundStyle(tokens.gutter)
            .padding(.horizontal, tokens.space24)
            .padding(.vertical, tokens.space8)
            Divider().overlay(tokens.rule)
            ScrollView {
                LazyVStack(spacing: 0) {
                    ForEach(state.rows) { row in callRow(row) }
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
            Text("название = имя папки звонка · переименовать: клик по названию или в Finder")
                .font(tokens.ui(tokens.typeCaption))
                .foregroundStyle(tokens.gutter)
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(.horizontal, tokens.space24)
                .padding(.vertical, tokens.space12)
        }
        .font(tokens.ui(tokens.typeSmall))
        .background(tokens.win)
        .focusable()
        .focusEffectDisabled()
        .onKeyPress(keys: [.downArrow, .upArrow]) { press in
            event(press.key == .downArrow ? .selectNext : .selectPrevious)
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
    }

    private func rowContent(_ row: CallsListState.Row) -> some View {
        HStack(spacing: tokens.space12) {
            Text(row.date).font(tokens.data(tokens.typeSmall)).foregroundStyle(tokens.gutter)
                .frame(width: 130, alignment: .leading).allowsHitTesting(false)
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
                    .padding(.vertical, tokens.space4).padding(.horizontal, tokens.space8)
                    .background(tokens.surface, in: .rect(cornerRadius: tokens.radiusControl))
                    .overlay(RoundedRectangle(cornerRadius: tokens.radiusControl).stroke(tokens.me, lineWidth: 1.5))
                } else {
                    Button { event(.beginRename(row.id)) } label: {
                        VStack(alignment: .leading, spacing: tokens.space4) {
                            Text(row.displayTitle)
                            if !row.summaryStatus.isEmpty {
                                Text(row.summaryStatus).font(tokens.ui(tokens.typeCaption)).foregroundStyle(tokens.sub)
                                    .accessibilityIdentifier("calls.summary.\(row.id)")
                            }
                        }.frame(maxWidth: .infinity, alignment: .leading).contentShape(.rect)
                    }
                    .buttonStyle(.plain).disabled(!row.editable || state.busy)
                }
            }
            .font(tokens.ui(tokens.typeSmall, .semibold)).foregroundStyle(tokens.text)
            .disabled(!row.editable || state.busy)
            .frame(maxWidth: .infinity, alignment: .leading)
            Text(row.duration).font(tokens.data(tokens.typeSmall)).foregroundStyle(tokens.sub)
                .frame(width: 80, alignment: .leading).allowsHitTesting(false)
            eye(row)
            HStack(spacing: tokens.space4) {
                button("Открыть", destructive: false) { event(.open(row.id)) }
                button("Удалить", destructive: true) { event(.askDelete(row.id)) }
                    .disabled(!row.editable)
            }
            .frame(width: 170)
            .opacity(hovered == row.id ? 1 : 0)
            .allowsHitTesting(hovered == row.id)
            .accessibilityHidden(hovered != row.id)
            .disabled(state.busy)
        }
        .padding(.vertical, tokens.space12).padding(.horizontal, tokens.space24)
        .background(state.selectedID == row.id ? tokens.okBg : .clear)
        .background(hovered == row.id ? tokens.card : tokens.surface)
        .accessibilityAddTraits(state.selectedID == row.id ? .isSelected : [])
        .overlay(alignment: .bottom) { Rectangle().fill(tokens.rule).frame(height: 1) }
        .onHover { hovered = $0 ? row.id : nil }
    }

    private let eyeWidth: CGFloat = 28

    /// The eye a call with notes shows; a call without keeps its place empty.
    @ViewBuilder private func eye(_ row: CallsListState.Row) -> some View {
        if row.hasNotes {
            let previewed = state.previewedID == row.id
            Button { event(.preview(row.id)) } label: {
                Image(systemName: "eye")
                    .font(tokens.ui(tokens.typeSmall, .semibold))
                    .foregroundStyle(previewed ? tokens.me : tokens.sub)
                    .frame(width: eyeWidth, height: eyeWidth)
                    .background(previewed ? tokens.okBg : .clear, in: .rect(cornerRadius: tokens.radiusControl))
                    .contentShape(.rect)
            }
            .buttonStyle(.plain)
            .help("Показать заметки")
            .accessibilityLabel("Показать заметки")
            .accessibilityAddTraits(previewed ? .isSelected : [])
            .accessibilityIdentifier("calls.eye.\(row.id)")
        } else {
            Color.clear.frame(width: eyeWidth, height: eyeWidth)
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
