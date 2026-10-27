import struct CallText.State
import PanelUI
import Reading
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
    case .start, .stop, .switchLiveTextOn: nil
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
    return .init(recording: recording, log: log)
}

private func panelLines(_ lines: ReadingState.Lines) -> PanelState.Lines {

    .init(rows: lines.rows.map { row in
        switch row {
        case let .entry(entry): .entry(panelEntry(entry))
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
