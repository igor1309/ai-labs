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

    public static let states = states(in: SummaryPreviewText(language: .russian))

    /// The named states with the header and messages the app gives in that language; the notes are the call's own.
    public static func states(in text: SummaryPreviewText) -> [(name: String, state: SummaryPreviewState?)] {
        let english = text.language == .english
        let minutes = { (count: Int) in english ? "\(count) min" : "\(count) мин" }
        return [
            ("notes", .init(title: "Zoom", date: "17.10 · 11:00", duration: minutes(28), notes: .markdown(notes, made: english ? "October 17, 11:42" : "17 октября, 11:42"))),
            ("daily", .init(title: "iOS Daily", date: "11.11 · 10:00", duration: minutes(14), notes: .markdown(daily, made: english ? "November 11, 10:31" : "11 ноября, 10:31"))),
            ("unreadable", .init(title: "Zoom", date: "17.10 · 11:00", duration: minutes(28),
                                 notes: .unreadable(english ? "The notes can’t be read: “summary.md” is damaged."
                                                            : "Заметки не читаются: файл «summary.md» повреждён."))),
            ("making", .init(title: "iOS Daily", date: "11.11 · 10:00", duration: minutes(15), notes: .making)),
            ("failed", .init(title: "iOS & Android daily", date: "10.11 · 09:59", duration: minutes(14),
                             notes: .failed(english ? "Claude CLI exited with an error: request limit exceeded"
                                                    : "Claude CLI завершился с ошибкой: превышен лимит запросов"), canRetry: true)),
            ("no-summary", .init(title: "Zoom", date: "17.10 · 11:00", duration: minutes(28), notes: .none)),
            ("tags", .init(title: "Zoom", date: "17.10 · 11:00", duration: minutes(28), notes: .none,
                           tags: .shown(english ? ["client", "bank"] : ["клиент", "банк"]))),
            ("tags-editing", .init(title: "Zoom", date: "17.10 · 11:00", duration: minutes(28), notes: .none,
                                   tags: .editing(.init(tags: english ? ["client", "bank"] : ["клиент", "банк"],
                                                        entry: english ? "hir" : "най", completion: english ? "ing" : "м")))),
            ("tags-saving", .init(title: "Zoom", date: "17.10 · 11:00", duration: minutes(28), notes: .none,
                                  tags: .editing(.init(tags: english ? ["client"] : ["клиент"], saving: true)))),
            ("tags-failed", .init(title: "Zoom", date: "17.10 · 11:00", duration: minutes(28), notes: .none,
                                  tags: .editing(.init(tags: english ? ["client"] : ["клиент"],
                                                       failure: english ? "Couldn’t save the tags: disk is full" : "Не удалось сохранить теги: диск заполнен")))),
            ("no-selection", nil),
        ] + templateStates(in: text) + brokenTemplateStates(in: text)
    }

    /// The template menu, versions and outcomes, built directly as presentation values.
    public static func templateStates(in text: SummaryPreviewText = .init(language: .russian)) -> [(name: String, state: SummaryPreviewState?)] {
        let english = text.language == .english
        let templates: [SummaryPreviewState.Menu.Template] = [
            .init(id: "Default", name: "Default", enabled: true), .init(id: "Daily", name: "Daily", enabled: true),
        ]
        let menu = SummaryPreviewState.Menu(section: text(.makeAgainSection), templates: templates, keeping: true)
        let current = SummaryPreviewState(title: "Zoom", date: "17.10 · 11:00", duration: english ? "28 min" : "28 мин",
                                          notes: .markdown(english ? "## Decisions\n\nShip the release." : "## Решения\n\nВыпустить релиз.", made: "17.10, 11:42"),
                                          menu: menu, version: .current, templateName: "Daily")
        var previous = current
        previous.version = .previous; previous.templateName = "Default"
        previous.notes = .markdown(english ? "## Decisions\n\nFinish testing." : "## Решения\n\nЗавершить тестирование.", made: "17.10, 11:35")
        var single = current
        single.version = nil; single.templateName = "Default"
        var empty = single
        empty.notes = .none; empty.templateName = nil
        empty.menu = .init(section: text(.makeSection), templates: templates, keeping: nil)
        var remaking = current
        remaking.progress = text(.remaking, "Daily")
        remaking.menu?.templates = templates.map { .init(id: $0.id, name: $0.name, enabled: false) }
        var failure = current
        failure.failure = english ? "Request limit exceeded" : "Превышен лимит запросов"
        var off = current
        off.menu?.keeping = false
        var previousMarked = previous
        previousMarked.transcriptMark = text(.earlierTranscript)
        var currentMarked = current
        currentMarked.transcriptMark = text(.earlierTranscript)
        var singleMarked = single
        singleMarked.transcriptMark = text(.earlierTranscript)
        return [("templates-current", current), ("templates-previous", previous), ("templates-single", single),
                ("templates-empty", empty), ("templates-remaking", remaking), ("templates-failed", failure), ("templates-keep-off", off),
                ("templates-previous-marked", previousMarked), ("templates-current-marked", currentMarked),
                ("templates-single-marked", singleMarked)]
    }

    public static func brokenTemplateStates(in text: SummaryPreviewText = .init(language: .russian)) -> [(name: String, state: SummaryPreviewState?)] {
        var menu = brokenMenu(noUsableFiles: true, text: text)
        menu.folderFailure = text.language == .english ? "The templates folder could not be opened." : "Не удалось открыть папку шаблонов."
        return [("templates-folder-failed", .init(title: "Zoom", date: "17.10 · 11:00", duration: text.language == .english ? "28 min" : "28 мин",
                                                  notes: .none, menu: menu))]
    }

    public static func brokenMenu(noUsableFiles: Bool, text: SummaryPreviewText) -> SummaryPreviewState.Menu {
        .init(section: text(.makeAgainSection), templates: [
            .init(id: "Default", name: "Default", enabled: true),
            .init(id: "file:/Daily.md", name: "Daily", enabled: false,
                  reason: text.language == .english ? "Metadata needs required headings" : "В метаданных нет обязательных заголовков"),
        ], keeping: true, filesReason: noUsableFiles ? text(.noUsableTemplates) : nil, offersFolder: true)
    }

    public static func state(_ name: String, in text: SummaryPreviewText = .init(language: .russian)) -> SummaryPreviewState? {
        states(in: text).first { $0.name == name }!.state
    }

    /// The notes' source as plain text, for Xcode previews, which have no Markdown renderer.
    public static func plain(_ source: String, _ style: NotesStyle) -> NSAttributedString {
        NSAttributedString(string: source, attributes: [.font: style.body, .foregroundColor: style.text])
    }
}
