import SwiftUI

extension PanelState {

    /// One state per design frame, named after it, with the Russian text.
    static let previews = previews(in: PanelText(language: .russian))

    /// One state per design frame, named after it, with the panel's fixed text in the given language.
    static func previews(in text: PanelText) -> [(name: String, state: PanelState)] {

        func gap(_ speaker: Speaker, _ phrase: PanelPhrase) -> Gap {
            .init(speaker: speaker, text: String(format: text(phrase), "12:45"))
        }
        return [
            ("not-recording", .notRecording),
            ("recording", .recording),
            ("preparing", .preparing),
            ("live-text-off", .liveTextOff),
            ("switched-off-mid-call", .switchedOffMidCall),
            ("text-filled-in", .textFilledIn),
            ("settling-0s", .settling0),
            ("settling-4s", .settling4),
            ("settling-8s", .settling8),
            ("selection-held", .selectionHeld),
            ("long-selection-held", .longSelectionHeld),
            ("no-call-audio", .problem(.callAudioPreview(text), gap: gap(.them, .gapCallAudio))),
            ("no-microphone", .problem(.microphonePreview(text), gap: gap(.me, .gapMicrophone))),
            ("disk-full", .problem(.diskFullPreview(text), gap: gap(.them, .gapDiskFull))),
            ("call-silent", .problem(.callSilentPreview(text))),
            ("one-remote-speaker", .oneRemoteSpeaker),
            ("two-remote-speakers", .twoRemoteSpeakers),
            ("several-remote-speakers", .severalRemoteSpeakers),
        ]
    }

    static let notRecording = PanelState(recording: .off, log: .empty)

    static let recording = PanelState(
        recording: .on(elapsed: "00:12:47"),
        log: .lines(.init(entries: [
            .init(id: 2, time: "12:42", speaker: .me, settled: "Accountable — я. По слог отвечает команда Ильи."),
            .init(id: 3, time: "12:44", speaker: .them, settled: "Окей. Тогда ОКР на квартал. На квартал синхронизируем до пятницы."),
            .init(id: 4, time: "12:47", speaker: .me, settled: "И ещё по NPS —", pending: "дашборд кто-то уже уже"),
        ]))
    )

    static let preparing = PanelState(
        recording: .on(elapsed: "00:00:12"),
        log: .preparing(holds: [.init(entryID: 0, text: "Сохранённые слова")])
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

    /// After the call, a lone remote speaker stays plain Them.
    static let oneRemoteSpeaker = PanelState(
        recording: .off,
        log: .lines(.init(entries: [
            .init(id: 1, time: "12:41", speaker: .them, settled: "Всем привет. Начнём с ролей по запуску."),
            .init(id: 2, time: "12:42", speaker: .me, settled: "Accountable — я. По слог отвечает команда Ильи."),
            .init(id: 3, time: "12:44", speaker: .them, settled: "Окей. Тогда ОКР на квартал."),
        ]))
    )

    static let twoRemoteSpeakers = PanelState(
        recording: .off,
        log: .lines(.init(entries: [
            .init(id: 1, time: "12:41", speaker: .them, settled: "Всем привет. Начнём с ролей по запуску.", label: "Анна", remoteSpeaker: 1),
            .init(id: 2, time: "12:42", speaker: .them, settled: "Я бы сначала обсудил сроки.", label: "Собеседник 2", remoteSpeaker: 2),
            .init(id: 3, time: "12:43", speaker: .me, settled: "Accountable — я. По слог отвечает команда Ильи."),
            .init(id: 4, time: "12:44", speaker: .them, settled: "Окей. Тогда ОКР на квартал.", label: "Анна", remoteSpeaker: 1),
        ]))
    )

    /// Five speakers: the fifth takes the first one's colour again.
    static let severalRemoteSpeakers = PanelState(
        recording: .off,
        log: .lines(.init(entries: [
            .init(id: 1, time: "12:41", speaker: .them, settled: "Начнём с ролей.", label: "Анна", remoteSpeaker: 1),
            .init(id: 2, time: "12:42", speaker: .them, settled: "Сроки — до пятницы.", label: "Борис", remoteSpeaker: 2),
            .init(id: 3, time: "12:43", speaker: .them, settled: "Дежурит наша команда.", label: "Собеседник 3", remoteSpeaker: 3),
            .init(id: 4, time: "12:44", speaker: .them, settled: "Метрики соберу я.", label: "Собеседник 4", remoteSpeaker: 4),
            .init(id: 5, time: "12:45", speaker: .them, settled: "А дашборд кто?", label: "Собеседник 5", remoteSpeaker: 5),
            .init(id: 6, time: "12:46", speaker: .me, settled: "Дашборд — на мне."),
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

    static let longSelectionHeld = PanelState(
        recording: .on(elapsed: "00:12:47"),
        log: .preparing(holds: [
            .init(entryID: 1, text: "accountable"),
            .init(entryID: 2, text: "Давайте зафиксируем, кто accountable за поддержку и как команда будет измерять результат на следующий квартал. " + String(repeating: "Обсудим SLA и OKR. ", count: 8)),
        ])
    )

    static func problem(_ banner: Banner, gap: Gap? = nil) -> PanelState {

        var state = recording
        state.banners = [banner]
        if case var .lines(lines) = state.log, let gap {
            lines.rows.insert(.gap(gap), at: 2)
            state.log = .lines(lines)
        }
        return state
    }

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
    var text = PanelText(language: .russian)

    var body: some View {

        PanelView(state: state, event: { _ in }, config: config, text: text)
            .padding(config.tokens(for: scheme).space24)
            .background(config.tokens(for: scheme).back)
            .environment(\.colorScheme, scheme)
    }
}

#Preview("Not recording") { PanelPreview(state: .notRecording, scheme: .light) }
#Preview("Recording") { PanelPreview(state: .recording, scheme: .light) }
#Preview("Getting ready") { PanelPreview(state: .preparing, scheme: .light) }
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

#Preview("Recording problems, light") {
    ScrollView {
        VStack {
            ForEach(Array(PanelState.previews.suffix(4).enumerated()), id: \.offset) { _, preview in
                PanelPreview(state: preview.state, scheme: .light)
            }
        }
    }
}
#Preview("Recording problems, dark") {
    ScrollView {
        VStack {
            ForEach(Array(PanelState.previews.suffix(4).enumerated()), id: \.offset) { _, preview in
                PanelPreview(state: preview.state, scheme: .dark)
            }
        }
    }
}

extension PanelState.Banner {

    static func callAudioPreview(_ text: PanelText) -> Self {
        .init(kind: .callAudio, title: text(.callAudioTitle), line: text(.callAudioLine),
              button: text(.openSettings), action: .openSettings(.systemAudioRecording))
    }

    static func microphonePreview(_ text: PanelText) -> Self {
        .init(kind: .microphone, title: text(.microphoneTitle), line: text(.microphoneLine),
              button: text(.openSettings), action: .openSettings(.microphone))
    }

    static func diskFullPreview(_ text: PanelText) -> Self {
        .init(kind: .diskFull, title: text(.diskFullTitle), line: String(format: text(.diskFullLine), "12:45"),
              button: text(.openFolder), action: .openCallsFolder)
    }

    static func callSilentPreview(_ text: PanelText) -> Self {
        .init(kind: .callSilent, title: text(.callSilentTitle), line: text(.callSilentLine),
              button: text(.openSettings), action: .openSettings(.systemAudioRecording))
    }
}

#Preview("Recording problems, English") {
    ScrollView {
        VStack {
            ForEach(PanelState.previews(in: PanelText(language: .english)).suffix(4), id: \.name) { preview in
                PanelPreview(state: preview.state, scheme: .light, text: PanelText(language: .english))
            }
        }
    }
}
