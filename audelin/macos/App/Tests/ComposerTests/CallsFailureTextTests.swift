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
        (.partialDelete(folder: "2024.01.01-0700 Sync", reason: "disk"),
         "Не удалось удалить «2024.01.01-0700 Sync» целиком; часть папки могла остаться. disk",
         "Couldn’t delete all of “2024.01.01-0700 Sync”; part of the folder may remain. disk"),
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
