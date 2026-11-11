import CallsListUI
import Foundation
import Testing

struct CallsListStateTests {
    @Test func datesTitlesAndDurationsUseTheListLanguage() {
        let date = ISO8601DateFormatter().date(from: "2026-10-24T05:25:00Z")!
        for (duration, expected): (Double?, String) in [(nil, "—"), (0, "0 мин"), (2_820, "47 мин"), (4_320, "1 ч 12 мин"), (3_600, "1 ч 0 мин"), (.infinity, "—")] {
            let row = CallsListState.Row(id: "2026.10.24-1425-2", title: "", start: date, duration: duration,
                                         timeZone: TimeZone(identifier: "Asia/Tokyo")!, text: .init(language: .russian), editable: false)
            #expect(row.date == "24.10 · 14:25")
            #expect(row.displayTitle == "2026.10.24-1425")
            #expect(row.folderName == "2026.10.24-1425-2")
            #expect(row.duration == expected)
            #expect(!row.editable)
        }
    }

    @Test func durationsAndTheDeleteSentenceFollowTheGivenLanguage() {
        let english = CallsListText(language: .english)
        for (duration, expected): (Double, String) in [(2_820, "47 min"), (4_320, "1 h 12 min")] {
            let row = CallsListState.Row(id: "2026.10.24-1425", title: "", start: .distantPast, duration: duration, timeZone: .gmt, text: english, editable: true)
            #expect(row.duration == expected)
        }
        let row = CallsListState.Row(id: "2026.10.24-1405", title: "Sync", start: .distantPast, duration: nil, timeZone: .gmt, text: english, editable: true)
        #expect(CallsListState(rows: [row], deleteID: row.id).deleteBody(english)
            == "“2026.10.24-1405 Sync”: the whole call folder will be deleted — audio, transcripts and notes. This can’t be undone.")
    }

    @Test func deleteNamesTheWholeFolderAndSaysItCannotBeUndone() {
        let row = CallsListState.Row(id: "2026.10.24-1405-2", title: "Синк", start: .distantPast, duration: nil, timeZone: .gmt, text: .init(language: .russian), editable: true)
        let state = CallsListState(rows: [row], deleteID: row.id)
        #expect(row.displayTitle == "Синк")
        #expect(state.deleteBody(.init(language: .russian)) == "«2026.10.24-1405-2 Синк»: удалится вся папка звонка — аудио, расшифровки и саммари. Отменить нельзя.")
        #expect(CallsListState(rows: [row], deleteID: "gone").deleteBody(.init(language: .russian)) == nil)
    }
}
