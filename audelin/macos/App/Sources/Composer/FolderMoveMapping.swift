import Recordings
import SettingsUI

/// The move sheet's and progress lines' text, from Settings' catalog in the language `text` gives when it writes.
func folderMoveText(_ text: @escaping @Sendable () -> SettingsText) -> @Sendable (CallsFolderMove) -> MoveText {
    { move in
        let text = text()
        let size = text.size(move.totalBytes)
        return .init(title: text(.moveTitle, move.totalCalls, size),
                     body: text(.moveBody, move.totalCalls, size, move.destination.path),
                     detail: text(.moveDetail, move.completed.count, move.totalCalls, text.size(move.movedBytes), size),
                     moved: text(.moveMoved, move.completed.count, move.totalCalls))
    }
}

func applyFolderMove(_ state: RecordingsState, text: SettingsText, to result: inout SettingsState) {
    guard let move = state.move else {
        if state.phase == .refusedMove { result.folder.status = .recording }
        return
    }
    if state.phase == .failedMove, state.isListing {
        result.folder.status = .moving(done: move.progress, detail: text(.moveRefreshing))
        return
    }
    switch state.phase {
    case .askingMove:
        result.moveConfirm = .init(title: move.text.title, body: move.text.body)
    case .countingMove:
        result.folder.status = .moving(done: 0, detail: text(.moveCounting))
    case .reservingMove, .preparingMove, .moving, .storingFolder, .releasingMove:
        result.folder.status = .moving(done: move.progress, detail: move.text.detail)
    case .failedMove, .countFailed:
        let call = state.failure?.id.flatMap { id in move.remaining.first { $0.id == id } }
        let name = call.map { "«\($0.id)\($0.title.isEmpty ? "" : " " + $0.title)»: " } ?? ""
        result.folder.status = .failed(moved: move.text.moved, reason: name + (state.failure?.reason ?? ""))
    case .refusedMove: result.folder.status = .recording
    default: break
    }
}
