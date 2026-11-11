import Calls
import Foundation
import SettingsUI
import Testing
@testable import Composer

struct CallsFailureTextTests {

    @Test(arguments: [
        (CallsFailure.notFound(id: "2024.01.01-0700"), "Звонок «2024.01.01-0700» больше не найден.", "Call “2024.01.01-0700” can no longer be found."),
        (.ambiguous(id: "2024"), "Несколько папок имеют префикс «2024».", "Several folders start with “2024”."),
        (.invalidTitle, "Название содержит недопустимый символ.", "The title contains a character that isn’t allowed."),
        (.trashFailed(folder: "2024.01.01-0700 Sync", reason: "disk"),
         "Не удалось переместить «2024.01.01-0700 Sync» в Корзину; папка осталась на месте. disk",
         "Couldn’t move “2024.01.01-0700 Sync” to the Trash; the folder stays where it was. disk"),
        (.sizeMismatch, "Размеры файлов копии не совпадают с исходными.", "The copied files’ sizes don’t match the originals."),
    ])
    func eachFailureIsASentenceInTheChosenLanguage(failure: CallsFailure, russian: String, english: String) {
        #expect(SettingsText(language: .russian).callsFailure(failure) == russian)
        #expect(SettingsText(language: .english).callsFailure(failure) == english)
    }

    @Test func aFailureCallsDoesNotTypeKeepsTheSystemText() {
        let error = POSIXError(.EACCES)
        #expect(SettingsText(language: .english).callsFailure(error) == error.localizedDescription)
    }
}
