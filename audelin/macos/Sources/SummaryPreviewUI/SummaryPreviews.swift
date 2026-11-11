import AppKit
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

    /// A long Russian summary with English terms, as the app writes one.
    public static let daily = """
        ## О чём встреча

        Ежедневный дейли мобильной команды. Участники прошли по статусам задач и тестированию. Миша представил новую задачу по печатной форме в профиле карты, по ней обсудили показ ошибок на iOS и необходимость переделки лендинга. Также затронули отказ от OTP-кода для операций СБП, который зависит от бэка.

        ## Ключевые моменты

        ### Текущие задачи (Дима)

        - Номер задачи в работе распознан неоднозначно: 1773 / 177733 / 733. Дима сегодня на ней, только начал погружаться.
        - По 1781 билд выпущен. Ведущий спросил, почему MR не влит. Дима считает, что MR, вероятно, влиты, и обещал проверить. Факт мержа на встрече не подтверждён.
        - Две задачи на тестировании ждут фидбэка от Ники. Ника не может открыть приложение, ей нужны скриншоты от тестировщиков. Она писала Диме лично, а не в общую группу.

        ### iOS (ведущий, «Ме»)

        - Ведущий вернулся на iOS. Несколько билдов прошли, MR тоже прошли. Сегодня ведущий проведёт ревью, после него часть задач перейдёт в «готово к релизу».
        """

    public static let states: [(name: String, state: SummaryPreviewState)] = [
        ("notes", .init(title: "Zoom", date: "17.10 · 11:00", duration: "28 мин", notes: .markdown(notes))),
        ("daily", .init(title: "iOS Daily", date: "11.11 · 10:00", duration: "14 мин", notes: .markdown(daily))),
        ("unreadable", .init(title: "Zoom", date: "17.10 · 11:00", duration: "28 мин",
                             notes: .unreadable("Заметки не читаются: файл «summary.md» повреждён."))),
    ]

    public static func state(_ name: String) -> SummaryPreviewState {
        states.first { $0.name == name }!.state
    }

    /// The notes' source as plain text, for Xcode previews, which have no Markdown renderer.
    public static func plain(_ source: String, _ style: NotesStyle) -> NSAttributedString {
        NSAttributedString(string: source, attributes: [.font: style.body, .foregroundColor: style.text])
    }
}
