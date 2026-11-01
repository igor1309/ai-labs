import GlassLedger
import SwiftUI

/// The Settings window's content: one page of labelled rows.
///
/// Renders the state it is given and reports what the user does; it holds no
/// state of its own.
public struct SettingsView: View {

    private let state: SettingsState
    private let event: (SettingsEvent) -> Void
    private let config: SettingsConfig

    @Environment(\.colorScheme) private var scheme

    public init(
        state: SettingsState,
        event: @escaping (SettingsEvent) -> Void,
        config: SettingsConfig = .glassLedger
    ) {
        self.state = state
        self.event = event
        self.config = config
    }

    public var body: some View {

        VStack(alignment: .leading, spacing: tokens.space24) {

            row("Запись") { recording }
            row("Папка данных") { folder }
            row("Финальная расшифровка") { engines }
            row("Аудио") { audio }
            row("Объяснить термин") { explain }

            if let chunk = state.chunk {

                row("Размер фрагмента") { chunkPicker(chunk) }
            }
        }
        .padding(tokens.space24)
        .frame(width: config.windowWidth, alignment: .topLeading)
        .background(tokens.win)
        .overlay(alignment: .top) {

            if let confirm = state.moveConfirm {

                moveSheet(confirm)
            }
        }
    }
}

private extension SettingsView {

    var tokens: GlassLedger { config.tokens(for: scheme) }

    func text(
        _ string: String,
        _ font: Font,
        _ family: String,
        _ size: CGFloat,
        _ color: Color
    ) -> some View {

        Text(string)
            .font(font)
            .lineHeight(tokens.leading(family, size, config.lineHeight))
            .foregroundStyle(color)
    }

    func uiText(_ string: String, _ size: CGFloat, _ color: Color, _ weight: Font.Weight = .regular) -> some View {

        text(string, tokens.ui(size, weight), tokens.fontUi, size, color)
    }

    func dataText(_ string: String, _ size: CGFloat, _ color: Color, _ weight: Font.Weight = .regular) -> some View {

        text(string, tokens.data(size, weight), tokens.fontData, size, color)
    }

    func row(
        _ name: String,
        @ViewBuilder control: () -> some View
    ) -> some View {

        HStack(alignment: .top, spacing: tokens.space16) {

            uiText(name, tokens.typeBody, tokens.sub)
                .padding(.top, tokens.space6)
                .frame(width: config.labelWidth, alignment: .leading)

            VStack(alignment: .leading, spacing: tokens.space6) {

                control()
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
    }
}

// MARK: - Rows

private extension SettingsView {

    @ViewBuilder
    var recording: some View {

        checkbox("Записывать звонки автоматически", isOn: state.recordsCalls) {
            event(.setRecordsCalls($0))
        }
        uiText(
            "Запись начинается, когда Zoom, Телемост или браузер берёт микрофон, и останавливается, когда звонок закончился.",
            tokens.typeSmall,
            tokens.gutter
        )
        checkbox("Живой текст", isOn: state.liveText) {
            event(.setLiveText($0))
        }
        uiText(
            "Выключен — звонок только записывается. Включить можно и во время звонка: начало допишется из записи.",
            tokens.typeSmall,
            tokens.gutter
        )
    }

    @ViewBuilder
    var folder: some View {

        let status = state.folder.status

        HStack(spacing: tokens.space8) {

            dataText(state.folder.path, tokens.typeCaption, tokens.sub)
                .lineLimit(1)
                .truncationMode(.head)
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(.vertical, tokens.space6)
                .padding(.horizontal, tokens.space12)
                .background(tokens.surface, in: .rect(cornerRadius: tokens.radiusControl))
                .overlay(
                    RoundedRectangle(cornerRadius: tokens.radiusControl)
                        .strokeBorder(tokens.rule, lineWidth: 1)
                )

            button("Изменить…", .secondary, isEnabled: status.allowsChange) {
                event(.changeFolder)
            }
        }

        switch status {
        case let .idle(calls):
            dataText(
                "\(calls) (≈55 MB в час) · настройки и журналы — в ~/.audelin",
                tokens.typeSmall,
                tokens.gutter
            )

        case let .moving(done, detail):
            HStack(spacing: tokens.space8) {

                progress(done)
                dataText(detail, tokens.typeSmall, tokens.sub)
            }

        case let .failed(moved, reason):
            dataText("часть звонков ещё здесь", tokens.typeSmall, tokens.warn)
            errorBanner(moved, reason)
            button("Повторить", .secondary) { event(.retryMove) }

        case .recording:
            dataText("идёт запись — папку можно сменить после звонка", tokens.typeSmall, tokens.warn)
        }
    }

    var engines: some View {

        ForEach(state.engines) { engine in

            option(engine, isSelected: engine.id == state.selectedEngine)
        }
    }

    var audio: some View {

        uiText(
            "Хранится 7 дней после звонка, потом удаляется — только после проверки текста. Закреплённый звонок хранит аудио, пока не открепите. Текст не удаляется.",
            tokens.typeBody,
            tokens.text
        )
    }

    var explain: some View {

        HStack(spacing: tokens.space8) {

            dataText(state.explainKeys, tokens.typeBody, tokens.text)
                .padding(.vertical, tokens.space4)
                .padding(.horizontal, tokens.space12)
                .background(tokens.surface, in: .rect(cornerRadius: tokens.radiusControl))
                .overlay(
                    RoundedRectangle(cornerRadius: tokens.radiusControl)
                        .strokeBorder(tokens.rule, lineWidth: 1)
                )

            dataText("выделение → новый тред в bb", tokens.typeSmall, tokens.gutter)
        }
    }

    @ViewBuilder
    func chunkPicker(_ chunk: SettingsState.Chunk) -> some View {

        HStack(spacing: tokens.space8) {

            HStack(spacing: tokens.space2) {

                ForEach(chunk.options, id: \.self) { seconds in

                    let isSelected = seconds == chunk.selected

                    Button { event(.selectChunk(seconds)) } label: {

                        dataText("\(seconds) с", tokens.typeSmall, isSelected ? tokens.selText : tokens.text)
                            .padding(.vertical, tokens.space4)
                            .padding(.horizontal, tokens.space12)
                            .background(
                                isSelected ? tokens.selBg : .clear,
                                in: .rect(cornerRadius: tokens.radiusControl)
                            )
                    }
                    .buttonStyle(.plain)
                }
            }
            .padding(tokens.space2)
            .background(tokens.btn, in: .rect(cornerRadius: tokens.radiusControl))

            dataText("DEBUG", tokens.typeCaption, tokens.warn, .semibold)
                .padding(.vertical, tokens.space2)
                .padding(.horizontal, tokens.space6)
                .background(tokens.warnBg, in: .rect(cornerRadius: tokens.radiusBar))
        }

        dataText(
            "Только в debug-сборке. В релизе — \(chunk.releaseDefault) с.",
            tokens.typeSmall,
            tokens.gutter
        )
    }
}

// MARK: - Controls

private extension SettingsView {

    func checkbox(
        _ label: String,
        isOn: Bool,
        set: @escaping (Bool) -> Void
    ) -> some View {

        Button { set(!isOn) } label: {

            HStack(spacing: tokens.space8) {

                ZStack {

                    RoundedRectangle(cornerRadius: tokens.radiusBar)
                        .fill(isOn ? tokens.selBg : tokens.surface)

                    if isOn {

                        Text("✓")
                            .font(tokens.ui(tokens.typeSmall, .semibold))
                            .foregroundStyle(tokens.selText)
                    } else {

                        RoundedRectangle(cornerRadius: tokens.radiusBar)
                            .strokeBorder(tokens.sub, lineWidth: 1)
                    }
                }
                .frame(width: 16, height: 16)

                uiText(label, tokens.typeBody, tokens.text)
            }
            .contentShape(.rect)
        }
        .buttonStyle(.plain)
    }

    enum ButtonKind { case primary, secondary }

    func button(
        _ label: String,
        _ kind: ButtonKind,
        isEnabled: Bool = true,
        fill: Bool = false,
        action: @escaping () -> Void
    ) -> some View {

        let colors: (Color, Color) = switch (kind, isEnabled) {
        case (_, false): (tokens.dis, tokens.disText)
        case (.primary, true): (tokens.selBg, tokens.selText)
        case (.secondary, true): (tokens.btn, tokens.text)
        }

        return Button(action: action) {

            uiText(label, tokens.typeSmall, colors.1, .semibold)
                .padding(.vertical, tokens.space6)
                .padding(.horizontal, tokens.space16)
                .frame(maxWidth: fill ? .infinity : nil)
                .background(colors.0, in: .rect(cornerRadius: tokens.radiusControl))
        }
        .buttonStyle(.plain)
        .disabled(!isEnabled)
    }

    func option(_ engine: SettingsState.Engine, isSelected: Bool) -> some View {

        Button { event(.selectEngine(engine.id)) } label: {

            HStack(spacing: tokens.space12) {

                // Centred on the 16 pt circle, as the design strokes it.
                Circle()
                    .stroke(isSelected ? tokens.me : tokens.chip, lineWidth: isSelected ? 5 : 1.5)
                    .frame(width: 16, height: 16)

                VStack(alignment: .leading, spacing: tokens.space2) {

                    dataText(engine.name, tokens.typeBody, tokens.text, .semibold)
                    uiText(engine.note, tokens.typeSmall, tokens.sub)
                }
                .frame(maxWidth: .infinity, alignment: .leading)

                VStack(alignment: .trailing, spacing: tokens.space4) {

                    dataText(engine.availability, tokens.typeCaption, tokens.me)
                    dataText(engine.size, tokens.typeCaption, tokens.gutter)
                }
            }
            .padding(tokens.space12)
            .background(tokens.surface, in: .rect(cornerRadius: tokens.radiusCard))
            .overlay(
                RoundedRectangle(cornerRadius: tokens.radiusCard)
                    .strokeBorder(isSelected ? tokens.me : tokens.rule, lineWidth: isSelected ? 1.5 : 1)
            )
            .contentShape(.rect)
        }
        .buttonStyle(.plain)
    }

    func progress(_ done: Double) -> some View {

        RoundedRectangle(cornerRadius: tokens.radiusBar)
            .fill(tokens.chip)
            .frame(width: 140, height: 4)
            .overlay(alignment: .leading) {

                RoundedRectangle(cornerRadius: tokens.radiusBar)
                    .fill(tokens.me)
                    .frame(width: 140 * min(max(done, 0), 1))
            }
    }

    func errorBanner(_ title: String, _ detail: String) -> some View {

        VStack(alignment: .leading, spacing: tokens.space2) {

            uiText(title, tokens.typeSmall, tokens.rec, .semibold)
            uiText(detail, tokens.typeSmall, tokens.sub)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.vertical, tokens.space12)
        .padding(.horizontal, tokens.space16)
        .background(tokens.errBg)
    }

    func moveSheet(_ confirm: SettingsState.MoveConfirm) -> some View {

        VStack(alignment: .leading, spacing: tokens.space12) {

            uiText("!", tokens.typeTitle, tokens.warn, .semibold)
                .frame(width: 40, height: 40)
                .background(tokens.warnBg, in: .rect(cornerRadius: tokens.radiusCard))

            uiText(confirm.title, tokens.typeTitle, tokens.text, .semibold)
            uiText(confirm.body, tokens.typeSmall, tokens.sub)

            VStack(spacing: tokens.space8) {

                button("Перенести", .primary, fill: true) { event(.confirmMove) }
                button("Отмена", .secondary, fill: true) { event(.cancelMove) }
            }
        }
        .padding(tokens.space24)
        .frame(width: 340)
        .background {
            RoundedRectangle(cornerRadius: tokens.radiusCard)
                .fill(tokens.win)
                .shadow(color: tokens.shadow, radius: 16, y: 12)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
        .background(tokens.shadow)
    }
}

private extension SettingsState.Folder.Status {

    var allowsChange: Bool {

        if case .idle = self { true } else { false }
    }
}
