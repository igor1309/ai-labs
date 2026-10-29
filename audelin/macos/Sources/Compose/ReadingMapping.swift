import struct CallText.State
import PanelUI
import Reading
import Recording
import Session

func readingRecording(_ state: SessionState) -> ReadingRecording {

    state.phase == .recording ? .on(elapsed: 0) : .off
}

func readingText(_ state: State) -> ReadingTextUpdate {

    let status: ReadingTextUpdate.Status = switch state.status {
    case .off: .off
    case .gettingReady: .gettingReady
    case .listening: .listening
    case let .failed(error): .failed(error)
    case .finished: .finished
    }
    return .init(status: status, entries: state.entries.map { entry in
        .init(
            id: .init(speaker: entry.speaker == .mine ? .mine : .theirs, localID: entry.text.id),
            start: entry.text.start, end: entry.text.end,
            settled: entry.text.settled, pending: entry.text.pending, writtenLater: entry.writtenLater
        )
    })
}

func readingEvent(_ event: PanelEvent) -> ReadingEvent? {

    switch event {
    case let .hold(held): .hold(.init(entryID: held.entryID, text: held.text))
    case let .letGo(held): .letGo(.init(entryID: held.entryID, text: held.text))
    case let .scrolled(atBottom): .scrolled(atBottom: atBottom)
    case .jumpToLive: .jumpToLive
    case .start, .stop, .switchLiveTextOn, .openSettings, .openCallsFolder: nil
    }
}

func panelState(_ state: ReadingState) -> PanelState {

    let recording: PanelState.Recording = switch state.recording {
    case .off: .off
    case let .on(elapsed): .on(elapsed: elapsed)
    }
    let log: PanelState.Log = switch state.log {
    case .empty: .empty
    case let .liveTextOff(kept): .liveTextOff(kept: kept.map(panelLines))
    case let .preparing(holds): .preparing(holds: holds.map(panelHeld))
    case let .lines(lines): .lines(panelLines(lines))
    }
    return .init(recording: recording, log: log, banners: state.banners.map { banner in
        switch banner.kind {
        case .callAudio: .callAudio
        case .microphone: .microphone
        case .diskFull: .diskFull(savedUntil: banner.time)
        case .callSilent: .callSilent
        }
    })
}

private func panelLines(_ lines: ReadingState.Lines) -> PanelState.Lines {

    .init(rows: lines.rows.map { row in
        switch row {
        case let .entry(entry): .entry(panelEntry(entry))
        case let .gap(gap):
            .gap(.init(speaker: gap.speaker == .mine ? .me : .them, text: gapText(gap)))
        case let .late(group): .late(.init(span: group.span, entries: group.entries.map(panelEntry)))
        }
    }, holds: lines.holds.map(panelHeld), newBelow: lines.newBelow, followsLive: lines.followsLive)
}

private func panelEntry(_ entry: ReadingState.Entry) -> PanelState.Entry {

    .init(id: entry.id, time: entry.time, speaker: entry.speaker == .mine ? .me : .them,
          settled: entry.settled, pending: entry.pending)
}

private func panelHeld(_ held: ReadingState.Held) -> PanelState.Held {

    .init(entryID: held.entryID, text: held.text)
}

private func gapText(_ gap: ReadingState.Gap) -> String {

    let reason = switch gap.kind {
    case .callAudio: "нет звука звонка"
    case .microphone: "нет микрофона"
    case .diskFull: "диск заполнен"
    case .callSilent: ""
    }
    return "— \(reason) с \(gap.time) —"
}

/// One health mapping supplies both the menu's faults and the panel's failed sides.
func readingFaultKinds(_ state: SessionState) -> [ReadingProblem.Kind] {

    var result: [ReadingProblem.Kind] = []
    for side: SessionSide in [.microphone, .call] {
        if [state.health(of: .access(side)), state.health(of: .capture(side))].contains(where: {
            switch $0 { case .failed, .accessLost: true; case .fine: false }
        }) {
            result.append(side == .microphone ? .microphone : .callAudio)
        }
        if case .failed = state.health(of: .track(side)) {
            result.append(.diskFull(side == .microphone ? .mine : .theirs))
        }
    }
    return result
}

func recordingFaults(_ state: SessionState) -> Set<RecordingFault> {

    Set(readingFaultKinds(state).compactMap { kind in
        switch kind {
        case .microphone: .microphone
        case .callAudio: .callAudio
        case .diskFull: .diskFull
        case .callSilent: nil
        }
    })
}
