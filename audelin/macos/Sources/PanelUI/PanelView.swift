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
            ForEach(Array(state.banners.enumerated()), id: \.offset) { _, banner in
                bannerView(banner)
            }
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

            case let .preparing(holds):
                holdsView(holds)

                Text("Живой текст готовится — звонок уже записывается.")
                    .font(tokens.ui(tokens.typeBody))
                    .lineHeight(tokens.leading(tokens.fontUi, tokens.typeBody, config.lineHeight))
                    .foregroundStyle(tokens.sub)

                Text("Текст появится с начала звонка.")
                    .font(tokens.data(tokens.typeBody))
                    .lineHeight(tokens.leading(tokens.fontData, tokens.typeBody, config.looseLineHeight))
                    .foregroundStyle(tokens.gutter)

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

        TranscriptLog(lines: lines, tokens: tokens, config: config, event: event)

        holdsView(lines.holds)

        if lines.newBelow > 0 {

            newBelowPill(lines.newBelow)
        }
    }

    @ViewBuilder
    func holdsView(_ holds: [PanelState.Held]) -> some View {

        if !holds.isEmpty {
            VStack(spacing: tokens.space4) {
                ForEach(Array(holds.enumerated()), id: \.offset) { _, held in
                    heldView(held)
                }
            }
        }
    }

    func heldView(_ held: PanelState.Held) -> some View {

        HStack(spacing: tokens.space6) {

            Image(systemName: "pin.fill")
                .font(.system(size: 14))
                .foregroundStyle(tokens.me)

            HeldTextLabel(text: "«\(held.text)»", tokens: tokens)
                .frame(maxWidth: .infinity, alignment: .leading)

            Button { event(.letGo(held)) } label: {

                Image(systemName: "xmark")
                    .font(.system(size: 14))
                    .foregroundStyle(tokens.gutter)
            }
            .buttonStyle(.plain)
            .help("Отпустить")
        }
        .padding(.vertical, tokens.space2)
        .padding(.horizontal, tokens.space8)
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

private extension PanelView {

    func bannerView(_ banner: PanelState.Banner) -> some View {

        let ink: Color = switch banner {
        case .callAudio, .microphone: tokens.warn
        case .diskFull: tokens.rec
        case .callSilent: tokens.me
        }
        let background: Color = switch banner {
        case .callAudio, .microphone: tokens.warnBg
        case .diskFull: tokens.errBg
        case .callSilent: tokens.okBg
        }
        return VStack(alignment: .leading, spacing: tokens.space6) {
            Text(banner.title)
                .font(tokens.ui(tokens.typeSmall, .semibold))
                .lineHeight(tokens.leading(tokens.fontUi, tokens.typeSmall, config.lineHeight))
            Text(banner.line)
                .foregroundStyle(tokens.sub)
                .font(tokens.ui(tokens.typeSmall))
                .lineHeight(tokens.leading(tokens.fontUi, tokens.typeSmall, config.lineHeight))
            Button(banner.button) { event(banner.action) }
                .font(tokens.ui(tokens.typeSmall, .semibold))
                .lineHeight(tokens.leading(tokens.fontUi, tokens.typeSmall, config.lineHeight))
                .buttonStyle(.plain)
        }
        .foregroundStyle(ink)
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(tokens.space12)
        .background(background, in: .rect(cornerRadius: tokens.radiusCard))
        .padding(.horizontal, tokens.space16)
        .padding(.bottom, tokens.space8)
    }
}
