/// The preview's named states, drawn by the Xcode previews and compared with
/// reference images by the tests.
public enum SummaryPreviews {
    public static let notes = """
        ## Итоги

        - RACI по запуску: accountable за SLA поддержки — я, ведёт команда Ильи.
          - On-call держит та же команда.
        - Дашборд NPS никто не собирал; Илья проверит.

        ## Решения

        1. OKR на квартал синхронизируем до пятницы.
        2. Релиз 2.4 выкатываем после **ревью SLA**.

        ```
        make release VERSION=2.4
        ```

        | Кто | Что | Срок |
        |---|---|---|
        | Илья | дашборд NPS | пт |
        | я | SLA-документ | чт |
        """

    public static let states: [(name: String, state: SummaryPreviewState)] = [
        ("notes", .init(title: "Zoom", date: "17.10 · 11:00", duration: "28 мин", notes: .markdown(notes))),
        ("unreadable", .init(title: "Zoom", date: "17.10 · 11:00", duration: "28 мин",
                             notes: .unreadable("Заметки не читаются: файл «summary.md» повреждён."))),
    ]

    public static func state(_ name: String) -> SummaryPreviewState {
        states.first { $0.name == name }!.state
    }
}
