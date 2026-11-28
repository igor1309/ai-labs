import CallsWindowUI
import Foundation
import Recordings
import SummaryPreviewUI

func splitSheetState(_ state: RecordingsState, format: CallsListFormat, now: Date) -> SplitCallSheetState? {
    guard let draft = state.split.draft else { return nil }
    let status: SplitCallSheetState.Status
    switch state.phase {
    case .choosingSplit: status = draft.failure.map(SplitCallSheetState.Status.failed) ?? .choosing
    case .runningSplit: status = .working
    case .publishingSplit:
        status = .publishing(message: state.split.publicationMessage, refresh: state.split.refreshFailed)
    default: return nil
    }
    let choices: [SplitChoices.Choice]
    if case let .ready(result) = state.split.choices { choices = result.choices } else { choices = [] }
    let text = SummaryPreviewText(language: format.text.language == .russian ? .russian : .english)
    let shown = choices.map { choice -> SplitCallSheetState.Choice in
        let before = SplitCallSheetState.Entry(time: format.duration(Double(choice.cut - choice.gap)),
                                               speaker: splitSpeaker(choice.beforeSpeaker, text), words: choice.before)
        let after = SplitCallSheetState.Entry(time: format.duration(Double(choice.cut)),
                                              speaker: splitSpeaker(choice.afterSpeaker, text), words: choice.after)
        return .init(id: choice.cut, gap: text(.splitSeconds, Int64(choice.gap)),
                     cut: after.time, before: before, after: after, transition: choice.suggestsTransition)
    }
    let call = draft.call
    let choice = choices.first { $0.cut == draft.cut }
    let stamp = format.stamp(call.start)
    let title = call.title.isEmpty ? stamp : call.title
    let original = "«\(title)», \(format.day(call.start, now: now)) · \(format.time(call.start)) · \(format.duration(call.duration))"
    let before = draft.cut.map(Double.init)
    let after = before.flatMap { cut in call.duration.map { max(0, $0 - cut) } }
    let first = SplitCallSheetState.Part(prefix: call.id, span: "\(format.time(call.start)) · \(format.duration(before))",
                                         title: draft.firstTitle)
    let secondTime = choice.map { format.time($0.secondPartMinute) } ?? "—"
    let second = SplitCallSheetState.Part(prefix: choice.map { format.stamp($0.secondPartMinute) } ?? "",
                                          span: "\(secondTime) · \(format.duration(after))", title: draft.secondTitle)
    let editable = state.phase == .choosingSplit
    return .init(call: original, choices: shown, selected: choice?.cut, first: first, second: second,
                 status: status, editable: editable, canConfirm: editable && choice != nil)
}

private func splitSpeaker(_ label: String, _ text: SummaryPreviewText) -> String {
    label == "Me" ? text(.splitMe) : label
}
