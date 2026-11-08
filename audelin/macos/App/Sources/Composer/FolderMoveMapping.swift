import Recordings
import SettingsUI

func applyFolderMove(_ state: RecordingsState, to result: inout SettingsState) {
    guard let move = state.move else {
        if state.phase == .refusedMove { result.folder.status = .recording }
        return
    }
    if state.phase == .failedMove, state.isListing {
        result.folder.status = .moving(done: move.progress, detail: "Обновляем список звонков…")
        return
    }
    switch state.phase {
    case .askingMove:
        result.moveConfirm = .init(title: move.text.title, body: move.text.body)
    case .countingMove:
        result.folder.status = .moving(done: 0, detail: "Считаем звонки…")
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
