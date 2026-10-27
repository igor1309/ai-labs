import MenuBar
import Preferences
import Recording
import Testing

struct MenuBarModelTests {

    @Test func idleEntriesReflectReadinessAndStoredChecks() {

        for (automatic, missing, reason, line): (Bool, Set<RecordingCondition>, String?, String) in [
            (true, [], nil, "Ждёт звонка"),
            (false, [], nil, "Не записывает"),
            (true, [.microphoneAccess], nil, "Нет доступа к микрофону"),
            (true, [.callAudioAccess], nil, "Нет доступа к звуку звонка"),
            (true, [.callsFolder], nil, "Папка звонков недоступна"),
            (true, [.room], nil, "Недостаточно места для записи"),
            (true, [.room, .microphoneAccess], nil, "Нет доступа к микрофону; Недостаточно места для записи"),
            (false, [], "Запись недоступна", "Запись недоступна"),
        ] {
            for liveText in [false, true] {
                var state = RecordingState(automatic: automatic, missing: missing)
                state.cannotRecord = reason
                let preferences = Preferences(automaticRecording: automatic, liveText: liveText)
                let menu = MenuBarModel(state: state, preferences: preferences)
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

        for origin: RecordingState.Origin in [.call, .hand] {
            for liveText in [false, true] {
                for phase: RecordingState.Phase in [.beginning, .recording, .ending] {
                    var state = RecordingState(automatic: false, missing: [])
                    state.phase = phase
                    state.session = .init(id: 1, origin: origin)
                    state.callOn = origin == .call
                    let line = phase == .ending ? "Завершает запись" : (
                        !liveText ? "Запись без текста" : (origin == .call ? "Запись · звонок" : "Запись")
                    )
                    let menu = MenuBarModel(state: state, preferences: Preferences(liveText: liveText))
                    #expect(menu.item.title == "Запись")
                    #expect(menu.item.symbol == "record.circle.fill")
                    #expect(menu.item.stateLine == line)
                    #expect(menu.entries == [.stateLine(line)]
                        + (phase == .ending ? [] : [.button("Остановить запись", .stop)])
                        + controls(automatic: true, liveText: liveText))
                }
            }
        }
    }

    @Test func itemIsRedOnlyDuringBringUpAndRecording() {

        for (phase, red): (RecordingState.Phase, Bool) in [
            (.idle, false), (.beginning, true), (.recording, true), (.ending, false),
        ] {
            var state = RecordingState()
            state.phase = phase
            let menu = MenuBarModel(state: state, preferences: Preferences(), statusLine: "Ошибка наблюдения")
            #expect(menu.item.isRed == red)
            #expect(menu.entries.first == .stateLine("Ошибка наблюдения"))
        }
    }

    private func controls(automatic: Bool, liveText: Bool) -> [MenuBarEntry] {

        [
            .toggle("Записывать звонки автоматически", checked: automatic, .setAutomatic(!automatic)),
            .toggle("Живой текст", checked: liveText, .setLiveText(!liveText)),
            .button("Открыть папку звонков", .openCallsFolder),
            .button("Выйти", .quit),
        ]
    }
}
