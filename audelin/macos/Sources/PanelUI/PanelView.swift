import GlassLedger
import SwiftUI

/// The floating live panel: a header with the recording control, and the log.
///
/// Renders the state it is given and reports what the user does; it holds no
/// state of its own.
public struct PanelView: View {

    private let state: PanelState
    private let event: (PanelEvent) -> Void
    private let config: PanelConfig

    @Environment(\.colorScheme) private var scheme

    public init(
        state: PanelState,
        event: @escaping (PanelEvent) -> Void,
        config: PanelConfig = .glassLedger
    ) {
        self.state = state
        self.event = event
        self.config = config
    }

    public var body: some View {

        VStack(spacing: 0) {

            header
            log
        }
        .frame(width: config.panelWidth)
        .background {
            RoundedRectangle(cornerRadius: tokens.radiusPanel)
                .fill(tokens.glass)
                .shadow(color: tokens.shadow, radius: 16, y: 12)
        }
    }
}

private extension PanelView {

    var tokens: GlassLedger { config.tokens(for: scheme) }
}

// MARK: - Header

private extension PanelView {

    var header: some View {

        HStack {

            switch state.recording {
            case .off:
                idleStatus
                Spacer()
                startButton

            case let .on(elapsed):
                recordingStatus(elapsed)
                Spacer()
                stopButton
            }
        }
        .padding(.vertical, tokens.space12)
        .padding(.horizontal, tokens.space16)
        .background(tokens.glass, in: .rect(cornerRadius: tokens.radiusPanel))
    }

    var idleStatus: some View {

        HStack(spacing: tokens.space8) {

            Circle()
                .fill(tokens.gutter)
                .frame(width: 8, height: 8)

            Text("не записывается")
                .font(tokens.data(tokens.typeCaption))
                .lineHeight(tokens.leading(tokens.fontData, tokens.typeCaption, config.lineHeight))
                .foregroundStyle(tokens.gutter)
        }
    }

    func recordingStatus(_ elapsed: String) -> some View {

        HStack(spacing: tokens.space8) {

            HStack(spacing: tokens.space2) {

                ForEach(Array([6, 12, 8, 14, 5, 10, 7].enumerated()), id: \.offset) { _, height in

                    RoundedRectangle(cornerRadius: tokens.radiusBar)
                        .fill(tokens.rec)
                        .frame(width: 2, height: CGFloat(height))
                }
            }

            Text("REC \(elapsed)")
                .font(tokens.data(tokens.typeCaption))
                .lineHeight(tokens.leading(tokens.fontData, tokens.typeCaption, config.lineHeight))
                .foregroundStyle(tokens.rec)
        }
    }

    var startButton: some View {

        Button { event(.start) } label: {

            HStack(spacing: tokens.space6) {

                Circle()
                    .fill(tokens.selText)
                    .frame(width: 7, height: 7)

                Text("Начать")
                    .font(tokens.ui(tokens.typeSmall, .semibold))
                    .lineHeight(tokens.leading(tokens.fontUi, tokens.typeSmall, config.lineHeight))
                    .foregroundStyle(tokens.selText)
            }
            .padding(.vertical, tokens.space4)
            .padding(.horizontal, tokens.space12)
            .background(tokens.selBg, in: .rect(cornerRadius: tokens.radiusControl))
        }
        .buttonStyle(.plain)
    }

    var stopButton: some View {

        Button { event(.stop) } label: {

            HStack(spacing: tokens.space6) {

                RoundedRectangle(cornerRadius: tokens.radiusBar)
                    .fill(tokens.rec)
                    .frame(width: 8, height: 8)

                Text("Стоп")
                    .font(tokens.ui(tokens.typeSmall, .semibold))
                    .lineHeight(tokens.leading(tokens.fontUi, tokens.typeSmall, config.lineHeight))
                    .foregroundStyle(tokens.rec)
            }
            .padding(.vertical, tokens.space4)
            .padding(.horizontal, tokens.space12)
            .background(tokens.errBg, in: .rect(cornerRadius: tokens.radiusControl))
        }
        .buttonStyle(.plain)
    }
}

// MARK: - Log

private extension PanelView {

    var log: some View {

        VStack(alignment: .leading, spacing: tokens.space12) {

            switch state.log {
            case .empty:
                Text("Запись не идёт. Начать — и текст появится здесь, для обеих сторон.")
                    .font(tokens.data(tokens.typeBody))
                    .lineHeight(tokens.leading(tokens.fontData, tokens.typeBody, config.looseLineHeight))
                    .foregroundStyle(tokens.gutter)

            case let .liveTextOff(kept):
                if let kept {

                    linesView(kept)
                }

                Text("Живой текст выключен — звонок только записывается.")
                    .font(tokens.ui(tokens.typeBody))
                    .lineHeight(tokens.leading(tokens.fontUi, tokens.typeBody, config.lineHeight))
                    .foregroundStyle(tokens.sub)

                Button("Включить живой текст") { event(.switchLiveTextOn) }
                    .buttonStyle(.plain)
                    .font(tokens.ui(tokens.typeBody, .semibold))
                    .lineHeight(tokens.leading(tokens.fontUi, tokens.typeBody, config.lineHeight))
                    .foregroundStyle(tokens.me)

            case let .lines(lines):
                linesView(lines)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.vertical, tokens.space12)
        .padding(.horizontal, tokens.space16)
    }

    @ViewBuilder
    func linesView(_ lines: PanelState.Lines) -> some View {

        if let late = lines.late {

            lateView(late)

            Rectangle()
                .fill(tokens.rule)
                .frame(height: 1)
        }

        ForEach(lines.entries) { entry in

            entryView(entry, held: lines.held)
        }

        if let held = lines.held {

            heldView(held)
        }

        if lines.newBelow > 0 {

            newBelowPill(lines.newBelow)
        }
    }

    func lateView(_ late: PanelState.Late) -> some View {

        VStack(alignment: .leading, spacing: tokens.space8) {

            Text("дописано позже · \(late.span)")
                .font(tokens.data(tokens.typeCaption))
                .lineHeight(tokens.leading(tokens.fontData, tokens.typeCaption, config.lineHeight))
                .foregroundStyle(tokens.gutter)

            ForEach(late.entries) { entryView($0, held: nil) }
        }
        .opacity(0.6)
    }

    func entryView(
        _ entry: PanelState.Entry,
        held: PanelState.Held?
    ) -> some View {

        HStack(alignment: .firstTextBaseline, spacing: tokens.space12) {

            HStack(spacing: tokens.space8) {

                Text(entry.time)
                    .foregroundStyle(tokens.gutter)

                Text(entry.speaker == .me ? "я" : "они")
                    .fontWeight(.semibold)
                    .foregroundStyle(entry.speaker == .me ? tokens.me : tokens.them)
            }
            .font(tokens.data(tokens.typeBody))
            .lineHeight(tokens.leading(tokens.fontData, tokens.typeBody, config.lineHeight))
            .frame(width: config.gutterWidth, alignment: .leading)

            let isHeld = held.map { $0.entryID == entry.id && entry.settled.contains($0.text) } ?? false

            VStack(alignment: .leading, spacing: 0) {

                if !entry.settled.isEmpty {

                    Text(entry.settled)
                        .foregroundStyle(isHeld ? tokens.selText : tokens.text)
                        .lineHeight(tokens.leading(tokens.fontData, tokens.typeBody, config.lineHeight))
                }

                if !entry.pending.isEmpty {

                    pendingLine(entry.pending)
                }
            }
            .font(tokens.data(tokens.typeBody))
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(
                isHeld ? tokens.selBg : .clear,
                in: .rect(cornerRadius: tokens.radiusControl)
            )
        }
    }

    func pendingLine(_ pending: String) -> some View {

        HStack(spacing: tokens.space2) {

            Text(pending)
                .foregroundStyle(tokens.gutter)
                .lineHeight(tokens.leading(tokens.fontData, tokens.typeBody, config.lineHeight))

            Rectangle()
                .fill(tokens.me)
                .frame(width: 2, height: 15)
        }
    }

    func heldView(_ held: PanelState.Held) -> some View {

        HStack(spacing: tokens.space6) {

            Image(systemName: "pin.fill")
                .font(.system(size: 14))
                .foregroundStyle(tokens.me)

            Text("«\(held.text)»")
                .font(tokens.data(tokens.typeSmall))
                .foregroundStyle(tokens.text)
                .lineLimit(1)
                .truncationMode(.middle)
        }
        .padding(.vertical, tokens.space2)
        .padding(.horizontal, tokens.space8)
        .frame(maxWidth: .infinity, alignment: .leading)
        .overlay(
            RoundedRectangle(cornerRadius: tokens.radiusCard)
                .stroke(tokens.selBg, lineWidth: 1)
        )
    }

    func newBelowPill(_ count: Int) -> some View {

        Button { event(.jumpToLive) } label: {

            Text("\(count) новые ↓")
                .font(tokens.data(tokens.typeCaption, .semibold))
                .lineHeight(tokens.leading(tokens.fontData, tokens.typeCaption, config.looseLineHeight))
                .foregroundStyle(tokens.me)
                .padding(.vertical, tokens.space2)
                .padding(.horizontal, tokens.space8)
                .background(tokens.card, in: .rect(cornerRadius: tokens.radiusCard))
                .overlay(
                    RoundedRectangle(cornerRadius: tokens.radiusCard)
                        .stroke(tokens.selBg, lineWidth: 1)
                )
        }
        .buttonStyle(.plain)
        .frame(maxWidth: .infinity)
    }
}
