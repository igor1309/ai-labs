import Recording

public struct MenuBarItem: Equatable, Sendable {

    public let title: String
    public let symbol: String
    public let stateLine: String
    public let isRed: Bool

    public static func from(_ state: RecordingState, liveText: Bool) -> MenuBarItem {

        if state.phase != .idle {
            let line = state.phase == .ending ? "Завершает запись" : (
                !liveText ? "Запись без текста" : (
                    state.session?.origin == .call ? "Запись · звонок" : "Запись"
                )
            )
            return MenuBarItem(
                title: "Запись", symbol: "record.circle.fill", stateLine: line,
                isRed: state.phase == .beginning || state.phase == .recording
            )
        }
        let reasons: [(RecordingCondition, String)] = [
            (.microphoneAccess, "Нет доступа к микрофону"),
            (.callAudioAccess, "Нет доступа к звуку звонка"),
            (.callsFolder, "Папка звонков недоступна"),
            (.room, "Недостаточно места для записи"),
        ]
        let missing = reasons.filter { state.missing.contains($0.0) }.map(\.1)
        let line = !missing.isEmpty ? missing.joined(separator: "; ") : (
            state.cannotRecord ?? (state.automatic ? "Ждёт звонка" : "Не записывает")
        )
        return MenuBarItem(title: "Audelin", symbol: "text.alignleft", stateLine: line, isRed: false)
    }
}
