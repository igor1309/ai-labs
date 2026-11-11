import CallsListUI
import Testing

struct CallsListStateTests {
    @Test func deleteNamesTheWholeFolderAndSaysItCannotBeUndone() {
        let row = CallsListState.Row(id: "2026.10.24-1405-2", title: "Синк", displayTitle: "Синк", day: nil, time: "", duration: "", editable: true)
        let state = CallsListState(rows: [row], deleteID: row.id)
        #expect(row.folderName == "2026.10.24-1405-2 Синк")
        #expect(state.deleteBody == "«2026.10.24-1405-2 Синк»: удалится вся папка звонка — аудио, расшифровки и саммари. Отменить нельзя.")
        #expect(CallsListState(rows: [row], deleteID: "gone").deleteBody == nil)
    }
}
