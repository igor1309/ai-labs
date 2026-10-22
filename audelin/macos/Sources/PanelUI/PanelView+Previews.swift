import SwiftUI

extension PanelState {

    /// One state per design frame, named after it.
    static let previews: [(name: String, state: PanelState)] = [
        ("not-recording", .notRecording),
        ("recording", .recording),
        ("live-text-off", .liveTextOff),
        ("switched-off-mid-call", .switchedOffMidCall),
        ("text-filled-in", .textFilledIn),
        ("settling-0s", .settling0),
        ("settling-4s", .settling4),
        ("settling-8s", .settling8),
        ("selection-held", .selectionHeld),
    ]

    static let notRecording = PanelState(recording: .off, log: .empty)

    static let recording = PanelState(
        recording: .on(elapsed: "00:12:47"),
        log: .lines(.init(entries: [
            .init(id: 2, time: "12:42", speaker: .me, settled: "Accountable — я. По слог отвечает команда Ильи."),
            .init(id: 3, time: "12:44", speaker: .them, settled: "Окей. Тогда ОКР на квартал. На квартал синхронизируем до пятницы."),
            .init(id: 4, time: "12:47", speaker: .me, settled: "И ещё по NPS —", pending: "дашборд кто-то уже уже"),
        ]))
    )

    static let liveTextOff = PanelState(
        recording: .on(elapsed: "00:03:10"),
        log: .liveTextOff(kept: nil)
    )

    static let switchedOffMidCall = PanelState(
        recording: .on(elapsed: "00:12:47"),
        log: .liveTextOff(kept: .init(entries: [
            .init(id: 2, time: "12:42", speaker: .me, settled: "Accountable — я. По слог отвечает команда Ильи."),
            .init(id: 3, time: "12:44", speaker: .them, settled: "Окей. Тогда ОКР на квартал. На квартал синхронизируем до пятницы."),
        ]))
    )

    static let textFilledIn = PanelState(
        recording: .on(elapsed: "00:05:02"),
        log: .lines(.init(rows: [
            .late(.init(span: "12:30–12:33", entries: [
                .init(id: 1, time: "12:31", speaker: .them, settled: "Всем привет. Начнём с ролей по запуску."),
                .init(id: 2, time: "12:32", speaker: .me, settled: "Да, и сразу по слог — кто дежурит."),
            ])),
            .entry(.init(id: 3, time: "12:34", speaker: .them, settled: "Окей. Тогда RACI соберём сегодня.")),
        ]))
    )

    static let settling0 = settling(settled: "", pending: "кто у нас аккаунтбл за слог")
    static let settling4 = settling(settled: "кто у нас accountable за", pending: "слог поддер")
    static let settling8 = settling(settled: "кто у нас accountable за слог поддержки?", pending: "")

    static let selectionHeld = PanelState(
        recording: .on(elapsed: "00:12:47"),
        log: .lines(.init(
            entries: [
                .init(id: 1, time: "12:41", speaker: .them, settled: "по запуску — кто у нас accountable за слог поддержки?"),
                .init(id: 2, time: "12:42", speaker: .me, settled: "Accountable — я. По слог отвечает команда Ильи."),
                .init(id: 3, time: "12:44", speaker: .them, settled: "Окей. Тогда ОКР на квартал. На квартал синхронизируем до пятницы."),
            ],
            holds: [
                .init(entryID: 1, text: "accountable за слог поддержки?"),
                .init(entryID: 3, text: "ОКР на квартал"),
            ],
            newBelow: 2,
            followsLive: false
        ))
    )

    private static func settling(settled: String, pending: String) -> PanelState {

        .init(
            recording: .on(elapsed: "00:12:41"),
            log: .lines(.init(entries: [
                .init(id: 1, time: "12:41", speaker: .them, settled: settled, pending: pending),
            ]))
        )
    }
}

/// The panel over the desktop tint the design draws behind it.
struct PanelPreview: View {

    let state: PanelState
    let scheme: ColorScheme
    var config: PanelConfig = .glassLedger

    var body: some View {

        PanelView(state: state, event: { _ in }, config: config)
            .padding(config.tokens(for: scheme).space24)
            .background(config.tokens(for: scheme).back)
            .environment(\.colorScheme, scheme)
    }
}

#Preview("Not recording") { PanelPreview(state: .notRecording, scheme: .light) }
#Preview("Recording") { PanelPreview(state: .recording, scheme: .light) }
#Preview("Live text off") { PanelPreview(state: .liveTextOff, scheme: .light) }
#Preview("Switched off mid-call") { PanelPreview(state: .switchedOffMidCall, scheme: .light) }
#Preview("Text filled in") { PanelPreview(state: .textFilledIn, scheme: .light) }
#Preview("Settling") {
    VStack(spacing: 0) {
        PanelPreview(state: .settling0, scheme: .light)
        PanelPreview(state: .settling4, scheme: .light)
        PanelPreview(state: .settling8, scheme: .light)
    }
}
#Preview("Selection held") { PanelPreview(state: .selectionHeld, scheme: .light) }
#Preview("Recording, dark") { PanelPreview(state: .recording, scheme: .dark) }
#Preview("Selection held, dark") { PanelPreview(state: .selectionHeld, scheme: .dark) }
