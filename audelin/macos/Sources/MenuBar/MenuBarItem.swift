public struct MenuBarItem: Equatable, Sendable {

    public let title: String
    public let symbol: String
    public let stateLine: String
    public let isRed: Bool

    public static func from(_ recording: MenuBarRecording, liveText: Bool) -> MenuBarItem {

        switch recording {
        case let .recording(call, faults):
            let line = !liveText ? "Запись без текста" : (call ? "Запись · звонок" : "Запись")
            return MenuBarItem(
                title: "Запись", symbol: "record.circle.fill", stateLine: line + faultLine(faults),
                isRed: true
            )
        case let .ending(faults):
            return MenuBarItem(
                title: "Запись", symbol: "record.circle.fill", stateLine: "Завершает запись" + faultLine(faults), isRed: false
            )
        case let .idle(automatic, unavailable, failure):
            let reasons: [(MenuBarBlocker, String)] = [
                (.microphone, "Нет доступа к микрофону"),
                (.callAudio, "Нет доступа к звуку звонка"),
                (.folder, "Папка звонков недоступна"),
                (.space, "Недостаточно места для записи"),
            ]
            let missing = reasons.filter { unavailable.contains($0.0) }.map(\.1)
            let line = !missing.isEmpty ? missing.joined(separator: "; ") : (
                failure ?? (automatic ? "Ждёт звонка" : "Не записывает")
            )
            return MenuBarItem(title: "Audelin", symbol: "text.alignleft", stateLine: line, isRed: false)
        }
    }

    private static func faultLine(_ faults: Set<MenuBarFault>) -> String {

        let labels: [(MenuBarFault, String)] = [
            (.microphone, "Микрофон не пишется"),
            (.callAudio, "Звук звонка не пишется"),
            (.diskFull, "Диск заполнен, дорожка остановлена"),
            (.callSilent, "Звук звонка не слышен — проверьте доступ к записи звука"),
        ]
        return labels.filter { faults.contains($0.0) }.map { "; " + $0.1 }.joined()
    }
}
