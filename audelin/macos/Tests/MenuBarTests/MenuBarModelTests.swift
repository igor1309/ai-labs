import MenuBar
import Testing

struct MenuBarModelTests {

    @Test func faultsAppendToRecordingAndEndingLinesInOrder() {

        for (faults, suffix): (Set<MenuBarFault>, String) in [
            ([.microphone], "; Микрофон не пишется"),
            ([.callAudio], "; Звук звонка не пишется"),
            ([.diskFull], "; Диск заполнен, дорожка остановлена"),
            ([.callAudio, .microphone], "; Микрофон не пишется; Звук звонка не пишется"),
            ([.callSilent], "; Звук звонка не слышен — проверьте доступ к записи звука"),
            ([.microphone, .callAudio, .diskFull], "; Микрофон не пишется; Звук звонка не пишется; Диск заполнен, дорожка остановлена"),
            (Set(MenuBarFault.allCases), "; Микрофон не пишется; Звук звонка не пишется; Диск заполнен, дорожка остановлена; Звук звонка не слышен — проверьте доступ к записи звука"),
        ] {
            for call in [false, true] {
                for liveText in [false, true] {
                    for ending in [false, true] {
                        let recording: MenuBarRecording = ending ? .ending(faults: faults) : .recording(call: call, faults: faults)
                        let base = ending ? "Завершает запись" : (!liveText ? "Запись без текста" : (call ? "Запись · звонок" : "Запись"))
                        let menu = MenuBarModel(recording: recording, preferences: .init(automatic: true, liveText: liveText))
                        #expect(menu.item.stateLine == base + suffix)
                        #expect(menu.entries.first == .stateLine(base + suffix))
                        #expect(menu.item.symbol == "record.circle.fill")
                        #expect(menu.item.isRed == !ending)
                    }
                }
            }
        }
    }


    @Test func idleEntriesReflectReadinessAndStoredChecks() {

        for (automatic, missing, reason, line): (Bool, Set<MenuBarBlocker>, String?, String) in [
            (true, [], nil, "Ждёт звонка"),
            (false, [], nil, "Не записывает"),
            (true, [.microphone], nil, "Нет доступа к микрофону"),
            (true, [.callAudio], nil, "Нет доступа к звуку звонка"),
            (true, [.folder], nil, "Папка звонков недоступна"),
            (true, [.space], nil, "Недостаточно места для записи"),
            (true, [.space, .microphone], "Ошибка записи", "Нет доступа к микрофону; Недостаточно места для записи"),
            (false, [], "Запись недоступна", "Запись недоступна"),
        ] {
            for liveText in [false, true] {
                let recording = MenuBarRecording.idle(automatic: automatic, unavailable: missing, failure: reason)
                let preferences = MenuBarPreferences(automatic: automatic, liveText: liveText)
                let menu = MenuBarModel(recording: recording, preferences: preferences)
                #expect(menu.item.title == "Audelin")
                #expect(menu.item.symbol == "text.alignleft")
                #expect(menu.item.stateLine == line)
                #expect(menu.entries == [.stateLine(line)]
                    + (missing.isEmpty ? [.button("Начать запись", .start)] : [])
                    + controls(automatic: automatic, liveText: liveText))
            }
        }
    }

    @Test func activeEntriesCoverCallHandAndRecordingWithoutText() {

        for byCall in [false, true] {
            for liveText in [false, true] {
                for recording: MenuBarRecording in [.recording(call: byCall, faults: []), .ending(faults: [])] {
                    let line = recording == .ending(faults: []) ? "Завершает запись" : (
                        !liveText ? "Запись без текста" : (byCall ? "Запись · звонок" : "Запись")
                    )
                    let menu = MenuBarModel(recording: recording,
                                            preferences: MenuBarPreferences(automatic: true, liveText: liveText))
                    #expect(menu.item.title == "Запись")
                    #expect(menu.item.symbol == "record.circle.fill")
                    #expect(menu.item.stateLine == line)
                    #expect(menu.entries == [.stateLine(line)]
                        + (recording == .ending(faults: []) ? [] : [.button("Остановить запись", .stop)])
                        + controls(automatic: true, liveText: liveText))
                }
            }
        }
    }

    @Test func itemIsRedOnlyWhileRecording() {

        for (recording, red): (MenuBarRecording, Bool) in [
            (.idle(automatic: true, unavailable: [], failure: nil), false),
            (.recording(call: false, faults: []), true), (.recording(call: true, faults: []), true), (.ending(faults: []), false),
        ] {
            let menu = MenuBarModel(recording: recording,
                preferences: MenuBarPreferences(automatic: true, liveText: true), statusLine: "Ошибка наблюдения")
            #expect(menu.item.isRed == red)
            #expect(menu.entries.first == .stateLine("Ошибка наблюдения"))
        }
    }

    private func controls(automatic: Bool, liveText: Bool) -> [MenuBarEntry] {

        [
            .toggle("Записывать звонки автоматически", checked: automatic, .setAutomatic(!automatic)),
            .toggle("Живой текст", checked: liveText, .setLiveText(!liveText)),
            .button("Звонки…", .showCalls),
            .button("Открыть папку звонков", .openCallsFolder),
            .button("Выйти", .quit),
        ]
    }
}
