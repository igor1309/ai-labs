import GlassLedger
import SwiftUI

public struct CallsListView: View {
    private let state: CallsListState
    private let event: (CallsListEvent) -> Void
    private let text: CallsListText
    @Environment(\.colorScheme) private var scheme
    @Environment(\.controlActiveState) private var activity
    @FocusState private var editing: Bool
    private var tokens: GlassLedger { .for(scheme) }

    public init(state: CallsListState, text: CallsListText, event: @escaping (CallsListEvent) -> Void) {
        self.state = state
        self.text = text
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
                    if state.search?.searching == true { searchingFooter }
                }
            }
            .overlay { if state.rows.isEmpty { placeholder } }
            if let failure = state.failure {
                Label(failure, systemImage: "exclamationmark.circle")
                    .font(tokens.ui(tokens.typeSmall))
                    .foregroundStyle(tokens.rec)
                    .lineLimit(2)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(.horizontal, tokens.space16).padding(.vertical, tokens.space8)
                    .background(tokens.errBg)
                    .accessibilityIdentifier("calls.failure")
            }
        }
        .font(tokens.ui(tokens.typeSmall))
        .background(tokens.win)
        .focusable()
        .focusEffectDisabled()
        .onExitCommand { if state.editing != nil { event(.cancelRename) } }
        .onKeyPress(keys: [.downArrow, .upArrow]) { press in
            guard state.editing == nil else { return .ignored }
            event(press.key == .downArrow ? .selectNext : .selectPrevious)
            return .handled
        }
        .onKeyPress(keys: [.return, .space, "r", .delete, .backspace]) { press in
            guard state.editing == nil, let row = state.rows.first(where: { $0.id == state.selectedID }),
                  let action = keyAction(press, row) else { return .ignored }
            event(action)
            return .handled
        }
        .overlay { if let body = state.deleteBody { deleteAlert(body) } }
        .onChange(of: state.editing?.id) { _, id in editing = id != nil }
        .onAppear { GlassLedger.registerFonts(); editing = state.editing != nil }
    }

    /// The whole row is a button that selects it. Renaming starts only from the menu or ⌘R.
    private func callRow(_ row: CallsListState.Row) -> some View {
        Button { event(.select(row.id)) } label: { rowContent(row).contentShape(.rect) }
            .buttonStyle(.plain)
            .simultaneousGesture(TapGesture(count: 2).onEnded { if !state.busy { event(.open(row.id)) } })
            .overlay {
                RowMenuTarget(identifier: "calls.row.\(row.id)", select: { event(.select(row.id)) }, items: { menu(row) })
            }
    }

    /// The row's actions, the same in its context menu and on its keys,
    /// each shown with its key.
    private func menu(_ row: CallsListState.Row) -> [RowMenuItem?] {
        var items: [RowMenuItem?] = [
            RowMenuItem(title: text(.open), key: "\r", isEnabled: !state.busy) { event(.open(row.id)) },
        ]
        items.append(RowMenuItem(title: text(.rename), key: "r", modifiers: .command, isEnabled: row.editable && !state.busy) {
            event(.beginRename(row.id))
        })
        if row.canRetrySummary {
            items.append(RowMenuItem(title: text(.retrySummary), isEnabled: !state.busy) { event(.retrySummary(row.id)) })
        }
        items.append(nil)
        items.append(RowMenuItem(title: text(.deleteMenu), key: "\u{8}", modifiers: .command, isEnabled: row.editable && !state.busy) {
            event(.askDelete(row.id))
        })
        return items
    }

    /// Return opens the folder in a wide window; in a narrow one Return and Space read the call. ⌘R renames and ⌘⌫ asks to delete the selected call.
    private func keyAction(_ press: KeyPress, _ row: CallsListState.Row) -> CallsListEvent? {
        let command = press.modifiers.contains(.command)
        switch press.key {
        case .return where !command && state.narrow, .space where !command && state.narrow: return .read(row.id)
        case .return where !command && !state.busy: return .open(row.id)
        case "r" where command && row.editable && !state.busy: return .beginRename(row.id)
        case .delete where command && row.editable && !state.busy, .backspace where command && row.editable && !state.busy: return .askDelete(row.id)
        default: return nil
        }
    }

    /// Two lines at a fixed height: the title and start time; then the duration
    /// and what the call was about, or where its summary stands.
    private func rowContent(_ row: CallsListState.Row) -> some View {
        VStack(alignment: .leading, spacing: tokens.space2) {
            HStack(spacing: tokens.space8) {
                Group {
                    if let edit = state.editing, edit.id == row.id {
                        HStack(spacing: 0) {
                            Text(row.id + " ").font(tokens.data(tokens.typeSmall)).foregroundStyle(tokens.gutter)
                            TextField(text(.titlePlaceholder), text: Binding(get: { edit.title }, set: { event(.editTitle($0)) }))
                                .textFieldStyle(.plain)
                                .focused($editing)
                                .onSubmit { event(.submitRename) }
                                .onExitCommand { event(.cancelRename) }
                        }
                        .padding(.horizontal, tokens.space4)
                        .background(tokens.surface, in: .rect(cornerRadius: tokens.radiusControl))
                        .overlay(RoundedRectangle(cornerRadius: tokens.radiusControl).stroke(tokens.me, lineWidth: 1.5))
                    } else {
                        title(row).allowsHitTesting(false)
                    }
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                Text(row.time).font(tokens.data(tokens.typeSmall)).foregroundStyle(ink(row, tokens.sub)).allowsHitTesting(false)
            }
            .frame(height: lineHeight)
            HStack(spacing: tokens.space8) {
                if let snippet = row.match?.snippet {
                    Text(snippet.place)
                        .font(snippet.placeIsTime ? tokens.data(tokens.typeSmall) : tokens.ui(tokens.typeSmall))
                        .foregroundStyle(ink(row, tokens.gutter))
                        .fixedSize().frame(minWidth: durationWidth, alignment: .leading).allowsHitTesting(false)
                    Text(marked(snippet.text, snippet.hits)).foregroundStyle(ink(row, tokens.sub)).truncationMode(.tail)
                        .frame(maxWidth: .infinity, alignment: .leading).allowsHitTesting(false)
                    if let more = snippet.more { Text(more).foregroundStyle(ink(row, tokens.gutter)).fixedSize().allowsHitTesting(false) }
                } else {
                    Text(row.duration).font(tokens.data(tokens.typeSmall)).foregroundStyle(ink(row, tokens.gutter))
                        .fixedSize().frame(minWidth: durationWidth, alignment: .leading).allowsHitTesting(false)
                    about(row).frame(maxWidth: .infinity, alignment: .leading).allowsHitTesting(false)
                }
                summary(row)
            }
            .frame(height: lineHeight)
        }
        .lineLimit(1)
        .padding(.horizontal, tokens.space16).padding(.vertical, tokens.space8)
        .background(state.selectedID == row.id ? (active ? tokens.selBg : tokens.btn) : tokens.surface)
        .overlay(alignment: .bottom) { Rectangle().fill(tokens.rule).frame(height: 1) }
        .accessibilityAddTraits(state.selectedID == row.id ? .isSelected : [])
    }

    /// The second line's text: the gist, or that the summary is being prepared or failed.
    @ViewBuilder private func about(_ row: CallsListState.Row) -> some View {
        switch row.summary {
        case .pending: Text(text(.rowPreparing)).foregroundStyle(ink(row, tokens.gutter))
        case .failed: Text(text(.rowFailed)).foregroundStyle(ink(row, tokens.rec))
        case .none:
            if let gist = row.gist { Text(gist).foregroundStyle(ink(row, tokens.sub)).truncationMode(.tail) }
            else { Color.clear }
        }
    }

    /// Whether the window is the active one; selection loses its accent otherwise.
    private var active: Bool { activity != .inactive }

    /// A selected row in the active window draws everything in `selText` on `selBg`.
    private func ink(_ row: CallsListState.Row, _ colour: Color) -> Color {
        state.selectedID == row.id && active ? tokens.selText : colour
    }

    /// The title on one line, cut with an ellipsis, its search matches marked;
    /// an untitled call shows its folder name.
    private func title(_ row: CallsListState.Row) -> some View {
        Text(marked(row.displayTitle, row.match?.title ?? []))
            .font(row.title.isEmpty ? tokens.data(tokens.typeSmall) : tokens.ui(tokens.typeSmall, .semibold))
            .foregroundStyle(ink(row, row.title.isEmpty ? tokens.gutter : tokens.text))
            .truncationMode(.tail)
    }

    /// The text with each range, in characters, on the `hit` colour.
    private func marked(_ string: String, _ ranges: [Range<Int>]) -> AttributedString {
        var text = AttributedString(string)
        let count = string.count
        for range in ranges where range.lowerBound >= 0 && range.upperBound <= count && !range.isEmpty {
            let lower = text.characters.index(text.startIndex, offsetBy: range.lowerBound)
            let upper = text.characters.index(lower, offsetBy: range.count)
            text[lower..<upper].backgroundColor = tokens.hit
        }
        return text
    }

    /// A spinner while the summary is prepared, a red mark when it failed.
    @ViewBuilder private func summary(_ row: CallsListState.Row) -> some View {
        switch row.summary {
        case .none: EmptyView()
        case .pending:
            ProgressView().controlSize(.mini).tint(ink(row, tokens.sub)).frame(width: iconSize, height: iconSize)
                .help(row.summaryStatus).accessibilityLabel(row.summaryStatus)
                .accessibilityIdentifier("calls.summary.\(row.id)")
        case .failed:
            Image(systemName: "exclamationmark.circle").font(tokens.ui(tokens.typeSmall, .semibold)).foregroundStyle(ink(row, tokens.rec))
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

    private let durationWidth: CGFloat = 48
    private let iconSize: CGFloat = 14
    private var lineHeight: CGFloat { tokens.space16 }

    private func button(_ title: String, destructive: Bool, action: @escaping () -> Void) -> some View {
        Button(role: destructive ? .destructive : nil, action: action) {
            Text(title).font(tokens.ui(tokens.typeSmall, .semibold))
                .foregroundStyle(destructive ? tokens.rec : tokens.text)
                .padding(.vertical, tokens.space6).padding(.horizontal, tokens.space12)
                .frame(maxWidth: .infinity)
                .background(destructive ? tokens.errBg : tokens.btn, in: .rect(cornerRadius: tokens.radiusControl))
        }.buttonStyle(.plain)
    }

    /// One centred message while the list loads, when it has no calls, or when a search finds none.
    @ViewBuilder private var placeholder: some View {
        if let search = state.search {
            if !search.searching {
                message(text(.noMatches), hint: text(.noMatchesHint, search.query))
            }
        } else {
            message(state.busy ? text(.loading) : text(.empty), hint: state.busy ? nil : text(.emptyHint))
        }
    }

    private func message(_ title: String, hint: String?) -> some View {
        VStack(spacing: tokens.space4) {
            Text(title).font(tokens.ui(tokens.typeSmall, .semibold)).foregroundStyle(tokens.sub)
            if let hint {
                Text(hint).font(tokens.ui(tokens.typeCaption)).foregroundStyle(tokens.gutter)
            }
        }
        .multilineTextAlignment(.center)
    }

    /// The list's last line while transcripts are still being read.
    private var searchingFooter: some View {
        HStack(spacing: tokens.space8) {
            ProgressView().controlSize(.mini)
            Text(text(.searching)).font(tokens.ui(tokens.typeCaption)).foregroundStyle(tokens.gutter)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.horizontal, tokens.space16).padding(.vertical, tokens.space12)
        .accessibilityIdentifier("calls.searching")
    }

    private func deleteAlert(_ body: String) -> some View {
        ZStack {
            tokens.shadow
            VStack(alignment: .leading, spacing: tokens.space12) {
                Text(text(.deleteTitle)).font(tokens.ui(tokens.typeTitle, .semibold)).foregroundStyle(tokens.text)
                Text(body).font(tokens.ui(tokens.typeSmall)).foregroundStyle(tokens.sub).fixedSize(horizontal: false, vertical: true)
                VStack(spacing: tokens.space8) {
                    button(text(.delete), destructive: true) { event(.confirmDelete) }
                        .disabled(state.rows.first(where: { $0.id == state.deleteID })?.editable != true)
                    button(text(.cancel), destructive: false) { event(.cancelDelete) }.keyboardShortcut(.cancelAction)
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

