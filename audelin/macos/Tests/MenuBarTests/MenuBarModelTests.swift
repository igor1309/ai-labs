import MenuBar
import Testing

struct MenuBarModelTests {

    @Test func everyTitleAndLineComesFromTheTextDependency() {

        var asked: [MenuBarPhrase] = []
        let menu = MenuBarModel(text: { asked.append($0); return "<\($0.rawValue)>" },
                                recording: .recording(call: true, faults: [.microphone]),
                                preferences: .init(automatic: true, liveText: true),
                                offersPanelReopen: true, panelVisible: false)

        #expect(menu.item.title == "<item.title>")
        #expect(menu.item.stateLine == "<state.recordingCall>; <fault.microphone>")
        #expect(menu.entries == [
            .stateLine("<state.recordingCall>; <fault.microphone>"), .divider,
            .button("<action.stop>", .stop), .button("<action.showPanel>", .showPanel), .divider,
            .toggle("<action.automatic>", checked: true, .setAutomatic(false)),
            .toggle("<action.liveText>", checked: true, .setLiveText(false)), .divider,
            .button("<action.calls>", .showCalls), .button("<action.openCallsFolder>", .openCallsFolder),
            .button("<action.settings>", .showSettings), .divider,
            .button("<action.quit>", .quit),
        ])
        #expect(Set(asked) == [.itemTitle, .recordingCall, .faultMicrophone, .stop, .showPanel, .automatic,
                               .liveText, .calls, .openCallsFolder, .settings, .quit])
    }

    @Test func showsEnglishWhenGivenEnglishText() {

        let menu = MenuBarModel(text: MenuBarText(language: .english).callAsFunction,
                                recording: .idle(automatic: true, unavailable: [], failure: nil),
                                preferences: .init(automatic: true, liveText: true))

        #expect(menu.item.stateLine == "Waiting for a call")
        #expect(menu.entries.contains(.button("Start Recording", .start)))
        #expect(menu.entries.last == .button("Quit", .quit))
    }

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
                        let menu = MenuBarModel(text: russian, recording: recording, preferences: .init(automatic: true, liveText: liveText))
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
                let menu = MenuBarModel(text: russian, recording: recording, preferences: preferences)
                #expect(menu.item.title == "Audelin")
                #expect(menu.item.symbol == "text.alignleft")
                #expect(menu.item.stateLine == line)
                #expect(menu.entries == [.stateLine(line), .divider]
                    + (missing.isEmpty ? [.button("Начать запись", .start), .divider] : [])
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
                    let menu = MenuBarModel(text: russian, recording: recording,
                                            preferences: MenuBarPreferences(automatic: true, liveText: liveText))
                    #expect(menu.item.title == "Запись")
                    #expect(menu.item.symbol == "record.circle.fill")
                    #expect(menu.item.stateLine == line)
                    #expect(menu.entries == [.stateLine(line), .divider]
                        + (recording == .ending(faults: []) ? [] : [.button("Остановить запись", .stop), .divider])
                        + controls(automatic: true, liveText: liveText))
                }
            }
        }
    }

    @Test func panelControlReflectsVisibilityAcrossRecordingPhases() {

        for recording: MenuBarRecording in [
            .idle(automatic: true, unavailable: [], failure: nil),
            .recording(call: false, faults: []), .ending(faults: []),
        ] {
            for visible in [false, true] {
                let menu = MenuBarModel(text: russian, recording: recording,
                    preferences: .init(automatic: true, liveText: true),
                    offersPanelReopen: !visible, panelVisible: visible)
                #expect(menu.entries.contains(.button("Скрыть панель", .hidePanel)) == visible)
                let canReopen = recording == .recording(call: false, faults: []) && !visible
                #expect(menu.entries.contains(.button("Показать панель", .showPanel)) == canReopen)
            }
        }
    }

    @Test func itemIsRedOnlyWhileRecording() {

        for (recording, red): (MenuBarRecording, Bool) in [
            (.idle(automatic: true, unavailable: [], failure: nil), false),
            (.recording(call: false, faults: []), true), (.recording(call: true, faults: []), true), (.ending(faults: []), false),
        ] {
            let menu = MenuBarModel(text: russian, recording: recording,
                preferences: MenuBarPreferences(automatic: true, liveText: true), statusLine: "Ошибка наблюдения")
            #expect(menu.item.isRed == red)
            #expect(menu.entries.first == .stateLine("Ошибка наблюдения"))
        }
    }

    private func controls(automatic: Bool, liveText: Bool) -> [MenuBarEntry] {

        [
            .toggle("Записывать звонки автоматически", checked: automatic, .setAutomatic(!automatic)),
            .toggle("Живой текст", checked: liveText, .setLiveText(!liveText)),
            .divider,
            .button("Звонки…", .showCalls),
            .button("Открыть папку звонков", .openCallsFolder),
            .button("Настройки…", .showSettings),
            .divider,
            .button("Выйти", .quit),
        ]
    }
}

private func russian(_ phrase: MenuBarPhrase) -> String { MenuBarText(language: .russian)(phrase) }
