import AppKit
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
        .frame(width: metrics.panelWidth)
        .background {
            RoundedRectangle(cornerRadius: metrics.radiusPanel)
                .fill(palette.glass)
                .shadow(color: palette.shadow, radius: 16, y: 12)
        }
    }
}

private extension PanelView {

    var palette: PanelConfig.Palette { config.palette(for: scheme) }
    var fonts: PanelConfig.Fonts { config.fonts }
    var metrics: PanelConfig.Metrics { config.metrics }

    func data(_ size: CGFloat, _ weight: Font.Weight = .regular) -> Font {

        .custom(fonts.data, fixedSize: size).weight(weight)
    }

    func ui(_ size: CGFloat, _ weight: Font.Weight = .regular) -> Font {

        .custom(fonts.ui, fixedSize: size).weight(weight)
    }

    /// Extra space between lines that makes the line height the design's
    /// ratio of the font size.
    func spacing(_ size: CGFloat, _ lineHeight: CGFloat? = nil) -> CGFloat {

        let natural = NSFont(name: fonts.data, size: size)
            .map { $0.ascender - $0.descender + $0.leading } ?? size

        return max(0, size * (lineHeight ?? fonts.lineHeight) - natural)
    }
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
        .padding(.vertical, metrics.space12)
        .padding(.horizontal, metrics.space16)
    }

    var idleStatus: some View {

        HStack(spacing: metrics.space8) {

            Circle()
                .fill(palette.gutter)
                .frame(width: 8, height: 8)

            Text("не записывается")
                .font(data(fonts.caption))
                .foregroundStyle(palette.gutter)
        }
    }

    func recordingStatus(_ elapsed: String) -> some View {

        HStack(spacing: metrics.space8) {

            HStack(spacing: metrics.space2) {

                ForEach(Array([6, 12, 8, 14, 5, 10, 7].enumerated()), id: \.offset) { _, height in

                    RoundedRectangle(cornerRadius: metrics.radiusBar)
                        .fill(palette.rec)
                        .frame(width: 2, height: CGFloat(height))
                }
            }

            Text("REC \(elapsed)")
                .font(data(fonts.caption))
                .foregroundStyle(palette.rec)
        }
    }

    var startButton: some View {

        Button { event(.start) } label: {

            HStack(spacing: metrics.space6) {

                Circle()
                    .fill(palette.selText)
                    .frame(width: 7, height: 7)

                Text("Начать")
                    .font(ui(fonts.small, .semibold))
                    .foregroundStyle(palette.selText)
            }
            .padding(.vertical, metrics.space4)
            .padding(.horizontal, metrics.space12)
            .background(palette.selBg, in: .rect(cornerRadius: metrics.radiusControl))
        }
        .buttonStyle(.plain)
    }

    var stopButton: some View {

        Button { event(.stop) } label: {

            HStack(spacing: metrics.space6) {

                RoundedRectangle(cornerRadius: metrics.radiusBar)
                    .fill(palette.rec)
                    .frame(width: 8, height: 8)

                Text("Стоп")
                    .font(ui(fonts.small, .semibold))
                    .foregroundStyle(palette.rec)
            }
            .padding(.vertical, metrics.space4)
            .padding(.horizontal, metrics.space12)
            .background(palette.errBg, in: .rect(cornerRadius: metrics.radiusControl))
        }
        .buttonStyle(.plain)
    }
}

// MARK: - Log

private extension PanelView {

    var log: some View {

        VStack(alignment: .leading, spacing: metrics.space12) {

            switch state.log {
            case .empty:
                Text("Запись не идёт. Начать — и текст появится здесь, для обеих сторон.")
                    .font(data(fonts.body))
                    .lineSpacing(spacing(fonts.body, fonts.looseLineHeight))
                    .foregroundStyle(palette.gutter)

            case .liveTextOff:
                Text("Живой текст выключен — звонок только записывается.")
                    .font(ui(fonts.body))
                    .lineSpacing(spacing(fonts.body))
                    .foregroundStyle(palette.sub)

                Button("Включить живой текст") { event(.switchLiveTextOn) }
                    .buttonStyle(.plain)
                    .font(ui(fonts.body, .semibold))
                    .foregroundStyle(palette.me)

            case let .lines(lines):
                linesView(lines)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.vertical, metrics.space12)
        .padding(.horizontal, metrics.space16)
    }

    @ViewBuilder
    func linesView(_ lines: PanelState.Lines) -> some View {

        if let late = lines.late {

            lateView(late)

            Rectangle()
                .fill(palette.rule)
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

        VStack(alignment: .leading, spacing: metrics.space8) {

            Text("дописано позже · \(late.span)")
                .font(data(fonts.caption))
                .foregroundStyle(palette.gutter)

            ForEach(late.entries) { entryView($0, held: nil) }
        }
        .opacity(0.6)
    }

    func entryView(
        _ entry: PanelState.Entry,
        held: PanelState.Held?
    ) -> some View {

        HStack(alignment: .firstTextBaseline, spacing: metrics.space12) {

            HStack(spacing: metrics.space8) {

                Text(entry.time)
                    .foregroundStyle(palette.gutter)

                Text(entry.speaker == .me ? "я" : "они")
                    .fontWeight(.semibold)
                    .foregroundStyle(entry.speaker == .me ? palette.me : palette.them)
            }
            .font(data(fonts.body))
            .frame(width: metrics.gutterWidth, alignment: .leading)

            VStack(alignment: .leading, spacing: spacing(fonts.body)) {

                if !entry.settled.isEmpty {

                    settledText(entry, held: held)
                }

                if !entry.pending.isEmpty {

                    pendingLine(entry.pending)
                }
            }
            .font(data(fonts.body))
            .lineSpacing(spacing(fonts.body))
            .frame(maxWidth: .infinity, alignment: .leading)
        }
    }

    @ViewBuilder
    func settledText(
        _ entry: PanelState.Entry,
        held: PanelState.Held?
    ) -> some View {

        if let held, held.entryID == entry.id, entry.settled.contains(held.text) {

            Text(highlighted(entry.settled, held.text))
        } else {

            Text(entry.settled)
                .foregroundStyle(palette.text)
        }
    }

    /// The held text in selection colours; the rest of the line stays plain.
    func highlighted(_ text: String, _ held: String) -> AttributedString {

        var string = AttributedString(text)
        string.foregroundColor = palette.text

        if let range = string.range(of: held) {

            string[range].foregroundColor = palette.selText
            string[range].backgroundColor = palette.selBg
        }

        return string
    }

    func pendingLine(_ pending: String) -> some View {

        HStack(spacing: metrics.space2) {

            Text(pending)
                .foregroundStyle(palette.gutter)

            Rectangle()
                .fill(palette.me)
                .frame(width: 2, height: 15)
        }
    }

    func heldView(_ held: PanelState.Held) -> some View {

        HStack(spacing: metrics.space6) {

            Image(systemName: "pin.fill")
                .font(.system(size: 11))
                .foregroundStyle(palette.me)

            Text("«\(held.text)»")
                .font(data(fonts.small))
                .foregroundStyle(palette.text)
                .lineLimit(1)
                .truncationMode(.middle)
        }
        .padding(.vertical, metrics.space2)
        .padding(.horizontal, metrics.space8)
        .frame(maxWidth: .infinity, alignment: .leading)
        .overlay(
            RoundedRectangle(cornerRadius: metrics.radiusCard)
                .stroke(palette.selBg, lineWidth: 1)
        )
    }

    func newBelowPill(_ count: Int) -> some View {

        Button { event(.jumpToLive) } label: {

            Text("\(count) новые ↓")
                .font(data(fonts.caption, .semibold))
                .foregroundStyle(palette.me)
                .padding(.vertical, metrics.space2)
                .padding(.horizontal, metrics.space8)
                .background(palette.card, in: .rect(cornerRadius: metrics.radiusCard))
                .overlay(
                    RoundedRectangle(cornerRadius: metrics.radiusCard)
                        .stroke(palette.selBg, lineWidth: 1)
                )
        }
        .buttonStyle(.plain)
        .frame(maxWidth: .infinity)
    }
}
