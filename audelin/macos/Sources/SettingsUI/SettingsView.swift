import GlassLedger
import SwiftUI

/// The Settings window's content: one page of labelled rows.
///
/// Renders the state it is given and reports what the user does; it holds no
/// domain state of its own; disclosure expansion is local presentation state.
public struct SettingsView: View {

    let state: SettingsState
    let event: (SettingsEvent) -> Void
    let config: SettingsConfig
    let text: SettingsText
    var scrolls = false
    var contentHeightChanged: (CGFloat) -> Void = { _ in }
    @State var notesDetailsExpanded = false
    @State var tabsHeight: CGFloat = 0
    @State var pageHeight: CGFloat = 0
    /// The segmented control or tab that holds keyboard focus, ringed in the accent colour.
    @State var focusedControl: String?

    @Environment(\.colorScheme) private var scheme

    public init(
        state: SettingsState,
        event: @escaping (SettingsEvent) -> Void,
        config: SettingsConfig = .glassLedger,
        text: SettingsText = .init(language: .russian)
    ) {
        self.state = state
        self.event = event
        self.config = config
        self.text = text
    }

    public var body: some View {
        if scrolls { scrollingBody } else { fullPageBody }
    }

    private var fullPageBody: some View {

        VStack(alignment: .leading, spacing: tokens.space16) {
            tabs
            page
        }
        .padding(tokens.space24)
        .frame(width: config.windowWidth, alignment: .topLeading)
        .background(tokens.win)
        .overlay(alignment: .top) {

            if state.selectedTab == .recording, let confirm = state.moveConfirm {

                moveSheet(confirm)
            }
        }
    }
}

extension SettingsView {

    @ViewBuilder
    var page: some View {
        switch state.selectedTab {
        case .general: generalPage
        case .recording: recordingPage
        case .callNotes: callNotesPage
        }
    }

    var generalPage: some View {
        VStack(alignment: .leading, spacing: tokens.space24) {

            row(text(.languageRow)) { segmented(state.general.language, id: "language") { event(.selectLanguage($0)) } }
            row(text(.appearanceRow)) { segmented(state.general.appearance, id: "appearance") { event(.selectAppearance($0)) } }
        }
    }

    /// Equal segments across the row; the selected one is raised on the track.
    @ViewBuilder
    func segmented<ID>(_ control: SettingsState.Segmented<ID>, id: String, select: @escaping (ID) -> Void) -> some View {

        segmentTrack(
            titles: control.segments.map(\.title), enabled: control.segments.map(\.isEnabled),
            selected: control.segments.firstIndex { $0.id == control.selected },
            ring: focusedControl == id ? control.segments.firstIndex { $0.id == control.selected } : nil
        )
        .overlay { segmentsTarget(titles: control.segments.map(\.title), enabled: control.segments.map(\.isEnabled),
                                  selected: control.segments.firstIndex { $0.id == control.selected }, id: id,
                                  segmentIDs: control.segments.map { "\(id)-\($0.id)" }) { select(control.segments[$0].id) } }

        uiText(control.hint, tokens.typeSmall, tokens.gutter)
    }

    /// The native-style track every segmented choice in Settings draws: a
    /// raised thumb under the selected segment and, while the control holds
    /// keyboard focus, an accent ring around the segment that has it. The
    /// ring sits in the track's padding, so nothing draws outside the control.
    func segmentTrack(
        titles: [String],
        enabled: [Bool],
        selected: Int?,
        ring: Int?,
        data: Bool = false,
        fill: Bool = true
    ) -> some View {

        HStack(spacing: tokens.space2) {

            ForEach(titles.indices, id: \.self) { index in

                let isSelected = index == selected
                let color = enabled[index] ? tokens.text : tokens.disText
                let label = titles[index]

                Group {
                    if data {
                        dataText(label, tokens.typeSmall, color, isSelected ? .medium : .regular)
                    } else {
                        uiText(label, tokens.typeSmall, color, isSelected ? .medium : .regular)
                    }
                }
                .lineLimit(1)
                .padding(.vertical, tokens.space2)
                .padding(.horizontal, tokens.space12)
                .frame(maxWidth: fill ? .infinity : nil)
                .background {
                    if isSelected {
                        RoundedRectangle(cornerRadius: tokens.radiusThumb)
                            .fill(tokens.segThumb)
                            .shadow(color: tokens.segShadow, radius: 1, y: 1)
                    }
                }
                .overlay {
                    if index == ring {
                        RoundedRectangle(cornerRadius: tokens.radiusThumb + tokens.space2)
                            .strokeBorder(tokens.me, lineWidth: 2)
                            .padding(-tokens.space2)
                    }
                }
            }
        }
        .padding(tokens.space2)
        .background(tokens.segTrack, in: .rect(cornerRadius: tokens.radiusControl))
        .accessibilityHidden(true)
    }

    /// AppKit target over a segment track: focus, clicks, arrow keys and the
    /// radio-group accessibility, reporting focus so the track draws its ring.
    func segmentsTarget(
        titles: [String],
        enabled: [Bool],
        selected: Int?,
        id: String,
        segmentIDs: [String],
        select: @escaping (Int) -> Void
    ) -> some View {

        SettingsSegmentsTarget(
            titles: titles, enabled: enabled, selected: selected, identifier: id,
            segmentIdentifiers: segmentIDs, select: select,
            focusChanged: { focusChanged(id, $0) })
    }

    func focusChanged(_ id: String, _ isFocused: Bool) {

        if isFocused { focusedControl = id } else if focusedControl == id { focusedControl = nil }
    }

    var recordingPage: some View {
        VStack(alignment: .leading, spacing: tokens.space24) {

            row(text(.recordingRow)) { recording }
            row(text(.folderRow)) { folder }
            row(text(.engineRow)) { engines }
            row(text(.audioRow)) { audio }
            row(text(.explainRow)) { explain }

            if let chunk = state.chunk {

                row(text(.chunkRow)) { chunkPicker(chunk) }
            }
        }
    }

    /// The tab bar is the same segmented track; each tab stays its own
    /// button to the keyboard and assistive apps.
    var tabs: some View {

        let all: [(String, SettingsState.Tab)] = [
            (text(.generalTab), .general), (text(.recordingTab), .recording), (text(.callNotesTab), .callNotes),
        ]

        return segmentTrack(
            titles: all.map(\.0), enabled: all.map { _ in true },
            selected: all.firstIndex { $0.1 == state.selectedTab },
            ring: all.firstIndex { focusedControl == "tab-\($0.1.rawValue)" }
        )
        .overlay {
            HStack(spacing: tokens.space2) {
                ForEach(all, id: \.1) { title, tab in
                    let id = "tab-\(tab.rawValue)"
                    SettingsPressTarget(
                        title: title, identifier: id, isEnabled: true, selected: state.selectedTab == tab,
                        action: { event(.selectTab(tab)) }, focusChanged: { focusChanged(id, $0) })
                }
            }
            .padding(tokens.space2)
        }
    }

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

extension SettingsView {

    @ViewBuilder
    var recording: some View {

        checkbox(text(.recordsCalls), isOn: state.recordsCalls) {
            event(.setRecordsCalls($0))
        }
        uiText(
            text(.recordsCallsNote),
            tokens.typeSmall,
            tokens.gutter
        )
        checkbox(text(.liveText), isOn: state.liveText) {
            event(.setLiveText($0))
        }
        uiText(
            text(.liveTextNote),
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

            button(text(.changeFolder), .secondary, isEnabled: status.allowsChange) {
                event(.changeFolder)
            }
        }

        switch status {
        case let .idle(calls):
            dataText(
                text(.folderIdle, calls),
                tokens.typeSmall,
                tokens.gutter
            )

        case let .moving(done, detail):
            HStack(spacing: tokens.space8) {

                progress(done)
                dataText(detail, tokens.typeSmall, tokens.sub)
            }

        case let .failed(moved, reason):
            dataText(text(.folderPartlyHere), tokens.typeSmall, tokens.warn)
            errorBanner(moved, reason)
            HStack(spacing: tokens.space8) {
                button(text(.retry), .secondary) { event(.retryMove) }
                button(text(.cancel), .secondary) { event(.cancelMove) }
            }

        case .recording:
            dataText(text(.folderRecording), tokens.typeSmall, tokens.warn)

        case let .pickerFailed(reason):
            errorBanner(text(.pickerFailed), reason)
        }
    }

    var engines: some View {

        ForEach(state.engines) { engine in

            option(engine, isSelected: engine.id == state.selectedEngine)
        }
    }

    var audio: some View {

        uiText(
            text(.audioNote),
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

            dataText(text(.explainNote), tokens.typeSmall, tokens.gutter)
        }
    }

    @ViewBuilder
    func chunkPicker(_ chunk: SettingsState.Chunk) -> some View {

        HStack(spacing: tokens.space8) {

            let titles = chunk.options.map { text(.chunkSeconds, $0) }
            let selected = chunk.options.firstIndex(of: chunk.selected)

            segmentTrack(
                titles: titles, enabled: titles.map { _ in true }, selected: selected,
                ring: focusedControl == "chunk" ? selected : nil, data: true, fill: false
            )
            .fixedSize()
            .overlay {
                segmentsTarget(titles: titles, enabled: titles.map { _ in true }, selected: selected, id: "chunk",
                               segmentIDs: chunk.options.map { "chunk-\($0)" }) { event(.selectChunk(chunk.options[$0])) }
            }

            dataText("DEBUG", tokens.typeCaption, tokens.warn, .semibold)
                .padding(.vertical, tokens.space2)
                .padding(.horizontal, tokens.space6)
                .background(tokens.warnBg, in: .rect(cornerRadius: tokens.radiusBar))
        }

        dataText(
            text(.chunkNote, chunk.releaseDefault),
            tokens.typeSmall,
            tokens.gutter
        )
    }
}

// MARK: - Controls

extension SettingsView {

    func checkbox(
        _ label: String,
        isOn: Bool,
        id: String? = nil,
        set: @escaping (Bool) -> Void
    ) -> some View {

        let content = HStack(spacing: tokens.space8) {

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
        return Group {
            if let id {
                content.accessibilityHidden(true).overlay {
                    SettingsPressTarget(title: label, identifier: id, isEnabled: true, checked: isOn) { set(!isOn) }
                }
            } else {
                Button { set(!isOn) } label: { content.contentShape(.rect) }
                    .buttonStyle(.plain)
            }
        }
    }

    enum ButtonKind { case primary, secondary }

    func button(
        _ label: String,
        _ kind: ButtonKind,
        isEnabled: Bool = true,
        fill: Bool = false,
        id: String? = nil,
        selected: Bool? = nil,
        action: @escaping () -> Void
    ) -> some View {

        let colors: (Color, Color) = switch (kind, isEnabled) {
        case (_, false): (tokens.dis, tokens.disText)
        case (.primary, true): (tokens.selBg, tokens.selText)
        case (.secondary, true): (tokens.btn, tokens.text)
        }

        let content = uiText(label, tokens.typeSmall, colors.1, .semibold)
            .padding(.vertical, tokens.space6)
            .padding(.horizontal, tokens.space16)
            .frame(maxWidth: fill ? .infinity : nil)
            .background(colors.0, in: .rect(cornerRadius: tokens.radiusControl))
        return Group {
            if let id {
                content.accessibilityHidden(true).overlay {
                    SettingsPressTarget(title: label, identifier: id, isEnabled: isEnabled, selected: selected, action: action)
                }
            } else {
                Button(action: action) { content }
                    .buttonStyle(.plain)
                    .disabled(!isEnabled)
            }
        }
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

                button(text(.confirmMove), .primary, fill: true) { event(.confirmMove) }
                button(text(.cancel), .secondary, fill: true) { event(.cancelMove) }
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

        switch self {
        case .idle, .pickerFailed: true
        case .moving, .failed, .recording: false
        }
    }
}
