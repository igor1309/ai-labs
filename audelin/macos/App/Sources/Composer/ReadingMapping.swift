import Foundation
import PanelUI
import SplitRows
import Reading
import Recording
import Session

func readingRecording(_ state: SessionState) -> ReadingRecording {

    state.phase == .recording ? .on(elapsed: 0) : .off
}

/// Maps the entries from position `from` on; those before it are already final.
func readingText(_ state: CallState, from: Int = 0, names: [Int: String] = [:]) -> ReadingTextUpdate {

    let status: ReadingTextUpdate.Status = switch state.status {
    case .off: .off
    case .gettingReady: .gettingReady
    case .listening: .listening
    case let .failed(error): .failed(error)
    case .finished: .finished
    }
    return .init(status: status, entries: state.entries[from...].map { entry in
        .init(
            id: .init(speaker: entry.speaker == .mine ? .mine : .theirs, localID: entry.text.id),
            start: entry.text.start, end: entry.text.end,
            settled: entry.text.settledText,
            pending: entry.text.pendingText,
            writtenLater: entry.writtenLater,
            name: entry.speaker == .mine ? nil : names[entry.text.id]
        )
    }, from: from, finalCount: state.finalCount)
}

func readingEvent(_ event: PanelEvent) -> ReadingEvent? {

    switch event {
    case let .hold(held): .hold(.init(entryID: held.entryID, text: held.text))
    case let .letGo(held): .letGo(.init(entryID: held.entryID, text: held.text))
    case let .scrolled(atBottom, interaction): .scrolled(atBottom: atBottom, interaction: interaction)
    case .jumpToLive: .jumpToLive
    case .start, .stop, .switchLiveTextOn, .openSettings, .openCallsFolder: nil
    }
}

/// The panel's rows already mapped from a layout's sealed rows, kept between states.
struct MappedRows {

    var layout = -1
    var mapped = 0
    var sealed: [PanelState.Row] = []
    /// The last sealed entry's remote speaker, so a caption shows only where it changes.
    var previousSpeaker: CaptionedSpeaker?
}

func panelState(_ text: (PanelPhrase) -> String, _ state: ReadingState) -> PanelState {

    var rows = MappedRows()
    return panelState(text, state, rows: &rows)
}

/// Maps reading state to what the panel shows; `text` gives the panel's fixed text in its language.
func panelState(_ text: (PanelPhrase) -> String, _ state: ReadingState, rows: inout MappedRows) -> PanelState {

    let recording: PanelState.Recording = switch state.recording {
    case .off: .off
    case let .on(elapsed): .on(elapsed: elapsed)
    }
    let log: PanelState.Log = switch state.log {
    case .empty: .empty
    case let .liveTextOff(kept): .liveTextOff(kept: kept.map { panelLines($0, text: text, acknowledgement: state.scrollAcknowledgement, rows: &rows) })
    case let .preparing(holds): .preparing(holds: holds.map(panelHeld))
    case let .lines(lines): .lines(panelLines(lines, text: text, acknowledgement: state.scrollAcknowledgement, rows: &rows))
    }
    return .init(recording: recording, log: log, banners: state.banners.map { banner in
        let settings = text(.openSettings)
        return switch banner.kind {
        case .callAudio:
            .init(kind: .callAudio, title: text(.callAudioTitle), line: text(.callAudioLine),
                  button: settings, action: .openSettings(.systemAudioRecording))
        case .microphone:
            .init(kind: .microphone, title: text(.microphoneTitle), line: text(.microphoneLine),
                  button: settings, action: .openSettings(.microphone))
        case .diskFull:
            .init(kind: .diskFull, title: text(.diskFullTitle), line: String(format: text(.diskFullLine), banner.time),
                  button: text(.openFolder), action: .openCallsFolder)
        case .callSilent:
            .init(kind: .callSilent, title: text(.callSilentTitle), line: text(.callSilentLine),
                  button: settings, action: .openSettings(.systemAudioRecording))
        }
    })
}

private func panelRow(_ row: ReadingState.Row, text: (PanelPhrase) -> String, previous: inout CaptionedSpeaker?) -> PanelState.Row {

    switch row {
    case let .entry(entry): .entry(panelEntry(entry, text: text, previous: &previous))
    case let .gap(gap):
        .gap(.init(speaker: gap.speaker == .mine ? .me : .them, text: gapText(gap, text: text)))
    case let .late(group): .late(.init(span: group.span, entries: group.entries.map { panelEntry($0, text: text, previous: &previous) }))
    }
}

private func panelLines(_ lines: ReadingState.Lines, text: (PanelPhrase) -> String, acknowledgement: UUID?, rows: inout MappedRows) -> PanelState.Lines {

    let sealed = lines.rows.sealed
    if rows.layout != lines.layout || rows.mapped > sealed.count { rows = .init(layout: lines.layout) }
    if rows.mapped < sealed.count {
        rows.sealed.append(contentsOf: sealed[rows.mapped...].map { panelRow($0, text: text, previous: &rows.previousSpeaker) })
        rows.mapped = sealed.count
    }
    var previous = rows.previousSpeaker
    let tail = lines.rows.tail.map { panelRow($0, text: text, previous: &previous) }
    return .init(rows: .init(sealed: rows.sealed, tail: tail), holds: lines.holds.map(panelHeld), newBelow: lines.newBelow, followsLive: lines.followsLive, scrollAcknowledgement: acknowledgement)
}

/// A remote speaker is captioned only where it differs from the entry before (design option C):
/// by name, else by its place among the call's speakers. Live names are guesses until the
/// after-call pass.
private func panelEntry(_ entry: ReadingState.Entry, text: (PanelPhrase) -> String, previous: inout CaptionedSpeaker?) -> PanelState.Entry {

    let remote = entry.speaker != .mine
    let place = remote ? entry.remoteSpeaker : nil
    let name = remote ? entry.name : nil
    let caption = name ?? place.map { String(format: text(.themNumbered), $0) }
    let speaker = place.map(CaptionedSpeaker.place) ?? name.map(CaptionedSpeaker.name)
    let label = speaker != nil && speaker != previous ? caption : nil
    defer { previous = speaker }
    return .init(id: entry.id, time: entry.time, speaker: remote ? .them : .me,
                 settled: entry.settled, pending: entry.pending,
                 label: label, labelIsTentative: label != nil && name != nil && !entry.nameConfirmed,
                 remoteSpeaker: place)
}

/// Who a remote entry is: its place among the call's speakers once known, else its live name.
enum CaptionedSpeaker: Equatable {
    case place(Int)
    case name(String)
}

private func panelHeld(_ held: ReadingState.Held) -> PanelState.Held {

    .init(entryID: held.entryID, text: held.text)
}

private func gapText(_ gap: ReadingState.Gap, text: (PanelPhrase) -> String) -> String {

    let format = switch gap.kind {
    case .callAudio: text(.gapCallAudio)
    case .microphone: text(.gapMicrophone)
    case .diskFull: text(.gapDiskFull)
    case .callSilent: text(.gapCallSilent)
    }
    return String(format: format, gap.time)
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
