import GlassLedger
import SummaryPreviewUI
import SwiftUI

public struct SplitCallSheetState: Equatable, Sendable {
    public struct Entry: Equatable, Sendable {
        public var time: String
        public var speaker: String
        public var words: String
        public init(time: String, speaker: String, words: String) {
            self.time = time
            self.speaker = speaker
            self.words = words
        }
    }

    public struct Choice: Equatable, Identifiable, Sendable {
        public var id: Int
        public var gap: String
        public var cut: String
        public var before: Entry
        public var after: Entry
        public var transition: Bool
        public init(id: Int, gap: String, cut: String, before: Entry, after: Entry, transition: Bool = false) {
            self.id = id
            self.gap = gap
            self.cut = cut
            self.before = before
            self.after = after
            self.transition = transition
        }
    }

    public struct Part: Equatable, Sendable {
        public var prefix: String
        public var span: String
        public var title: String
        public init(prefix: String, span: String, title: String) {
            self.prefix = prefix
            self.span = span
            self.title = title
        }
    }

    public enum Status: Equatable, Sendable {
        case choosing
        case working
        case publishing(message: String?, refresh: Bool)
        case failed(String)
    }

    public var call: String
    public var choices: [Choice]
    public var selected: Int?
    public var first: Part
    public var second: Part
    public var status: Status
    public var editable: Bool
    public var canConfirm: Bool

    public init(call: String, choices: [Choice], selected: Int?, first: Part, second: Part, status: Status,
                editable: Bool, canConfirm: Bool) {
        self.call = call
        self.choices = choices
        self.selected = selected
        self.first = first
        self.second = second
        self.status = status
        self.editable = editable
        self.canConfirm = canConfirm
    }
}

public enum SplitCallSheetEvent: Equatable, Sendable {
    case choose(Int), editFirst(String), editSecond(String), cancel, confirm, refresh
}

/// The split draft and its status, in the parent calls window's sheet.
public struct SplitCallSheet: View {
    public let state: SplitCallSheetState
    public let text: SummaryPreviewText
    public let event: (SplitCallSheetEvent) -> Void
    @Environment(\.colorScheme) private var scheme

    public init(state: SplitCallSheetState, text: SummaryPreviewText, event: @escaping (SplitCallSheetEvent) -> Void) {
        self.state = state
        self.text = text
        self.event = event
    }

    private var tokens: GlassLedger { .for(scheme) }

    public var body: some View {
        VStack(alignment: .leading, spacing: tokens.space16) {
            VStack(alignment: .leading, spacing: tokens.space4) {
                Text(text(.splitTitle)).font(tokens.ui(tokens.typeTitle, .semibold))
                Text(state.call).font(tokens.ui(tokens.typeSmall)).foregroundStyle(tokens.sub)
            }
            VStack(alignment: .leading, spacing: tokens.space8) {
                Text(text(.splitChoices)).font(tokens.ui(tokens.typeSmall, .semibold))
                if !state.choices.isEmpty {
                    ScrollView {
                        VStack(spacing: tokens.space6) {
                            ForEach(state.choices, content: choice)
                        }
                        .padding(tokens.space2)
                    }
                    .frame(maxHeight: 252)
                    .accessibilityIdentifier("calls.split.choices")
                }
            }
            .disabled(!state.editable)
            .opacity(state.editable ? 1 : 0.6)
            VStack(spacing: tokens.space12) {
                name(state.first, label: text(.splitFirst), id: "calls.split.first", edit: { event(.editFirst($0)) })
                name(state.second, label: text(.splitSecond), id: "calls.split.second", edit: { event(.editSecond($0)) })
            }
            .disabled(!state.editable)
            .opacity(state.editable ? 1 : 0.6)
            status
            HStack(spacing: tokens.space8) {
                Spacer()
                Button(text(.splitCancel)) { event(.cancel) }
                    .keyboardShortcut(.cancelAction)
                    .disabled(!state.editable)
                    .accessibilityIdentifier("calls.split.cancel")
                Button(text(state.editable ? .splitConfirm : .splitWorking)) { event(.confirm) }
                    .keyboardShortcut(.defaultAction)
                    .tint(tokens.me)
                    .disabled(!state.canConfirm)
                    .accessibilityIdentifier("calls.split.confirm")
            }
            .controlSize(.large)
        }
        .padding(tokens.space24)
        .foregroundStyle(tokens.text)
        .background(tokens.win)
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("calls.split.sheet")
    }

    private func choice(_ row: SplitCallSheetState.Choice) -> some View {
        let selected = row.id == state.selected
        return Button { event(.choose(row.id)) } label: {
            HStack(alignment: .top, spacing: tokens.space12) {
                Image(systemName: selected ? "largecircle.fill.circle" : "circle")
                    .foregroundStyle(selected ? tokens.me : tokens.gutter)
                    .font(tokens.ui(tokens.typeBody))
                VStack(alignment: .leading, spacing: tokens.space4) {
                    Text(row.gap).font(tokens.data(tokens.typeBody, .semibold))
                    Text(row.cut).font(tokens.data(tokens.typeCaption)).foregroundStyle(tokens.gutter)
                }
                .frame(width: tokens.space40 + tokens.space16, alignment: .leading)
                VStack(alignment: .leading, spacing: tokens.space4) {
                    entry(row.before)
                    entry(row.after)
                    if row.transition {
                        Text(text(.splitTransition))
                            .font(tokens.ui(tokens.typeCaption, .semibold))
                            .foregroundStyle(tokens.warn)
                            .padding(.horizontal, tokens.space6)
                            .background(tokens.warnBg, in: .capsule)
                    }
                }
                .frame(maxWidth: .infinity, alignment: .leading)
            }
            .multilineTextAlignment(.leading)
            .padding(tokens.space12)
            .background(selected ? tokens.okBg : tokens.surface, in: .rect(cornerRadius: tokens.radiusCard))
            .overlay {
                RoundedRectangle(cornerRadius: tokens.radiusCard)
                    .strokeBorder(selected ? tokens.me : tokens.rule)
            }
        }
        .buttonStyle(.plain)
        .accessibilityIdentifier("calls.split.choice.\(row.id)")
        .accessibilityLabel([row.gap, row.cut].joined(separator: ", "))
        .accessibilityValue(([row.before, row.after].map { "\($0.time) \($0.speaker) \($0.words)" }
                             + (row.transition ? [text(.splitTransition)] : [])).joined(separator: "\n"))
        .accessibilityAddTraits(selected ? .isSelected : [])
    }

    private func entry(_ row: SplitCallSheetState.Entry) -> some View {
        HStack(alignment: .firstTextBaseline, spacing: tokens.space8) {
            Text(row.time).font(tokens.data(tokens.typeCaption)).foregroundStyle(tokens.gutter)
            if !row.speaker.isEmpty {
                Text(row.speaker)
                    .font(tokens.ui(tokens.typeCaption, .semibold))
                    .foregroundStyle(row.speaker == text(.splitMe) ? tokens.me : tokens.them)
            }
            Text(row.words).font(tokens.ui(tokens.typeSmall))
        }
    }

    private func name(_ part: SplitCallSheetState.Part, label: String, id: String, edit: @escaping (String) -> Void) -> some View {
        VStack(alignment: .leading, spacing: tokens.space4) {
            HStack(spacing: tokens.space8) {
                Text(label).font(tokens.ui(tokens.typeSmall, .semibold))
                Text(part.span).font(tokens.data(tokens.typeCaption)).foregroundStyle(tokens.gutter)
            }
            HStack(spacing: tokens.space8) {
                Text(part.prefix).font(tokens.data(tokens.typeSmall)).foregroundStyle(tokens.gutter)
                TextField(label, text: Binding(get: { part.title }, set: edit))
                    .textFieldStyle(.plain)
                    .font(tokens.ui(tokens.typeBody))
                    .accessibilityLabel(label)
                    .accessibilityIdentifier(id)
            }
            .padding(.vertical, tokens.space8)
            .padding(.horizontal, tokens.space12)
            .background(tokens.surface, in: .rect(cornerRadius: tokens.radiusControl))
            .overlay { RoundedRectangle(cornerRadius: tokens.radiusControl).strokeBorder(tokens.rule) }
        }
    }

    @ViewBuilder private var status: some View {
        switch state.status {
        case .choosing: EmptyView()
        case .working: progress(text(.splitProgress))
        case let .publishing(message, refresh):
            HStack {
                progress(message ?? text(.splitPublishing))
                if refresh {
                    Button(text(.splitRefresh)) { event(.refresh) }
                        .accessibilityIdentifier("calls.split.refresh")
                }
            }
        case let .failed(reason):
            HStack(alignment: .top, spacing: tokens.space8) {
                Image(systemName: "exclamationmark.circle").foregroundStyle(tokens.rec)
                VStack(alignment: .leading, spacing: tokens.space4) {
                    Text(text(.splitFailed)).font(tokens.ui(tokens.typeSmall, .semibold)).foregroundStyle(tokens.rec)
                    Text("\(reason) \(text(.splitUnchanged))").font(tokens.ui(tokens.typeCaption)).foregroundStyle(tokens.sub)
                }
                Spacer(minLength: 0)
            }
            .padding(tokens.space8)
            .background(tokens.errBg, in: .rect(cornerRadius: tokens.radiusControl))
            .accessibilityElement(children: .ignore)
            .accessibilityLabel(text(.splitFailed))
            .accessibilityValue("\(reason) \(text(.splitUnchanged))")
            .accessibilityIdentifier("calls.split.failure")
        }
    }

    private func progress(_ message: String) -> some View {
        Text(message).font(tokens.ui(tokens.typeSmall)).foregroundStyle(tokens.sub)
            .accessibilityIdentifier("calls.split.progress")
    }
}
