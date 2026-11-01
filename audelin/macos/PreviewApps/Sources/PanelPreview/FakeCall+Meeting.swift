import PanelUI

extension [FakeCall.Phrase] {

    /// A short planning call, recognised as messily as the spike's Parakeet
    /// output: a phrase first arrives as heard, then settles, sometimes
    /// differently.
    static let meeting: Self = [
        .init(speaker: .them, stages: [
            .init(settled: "", pending: "по запуску кто у нас аккаунтбл"),
            .init(settled: "по запуску — кто у нас", pending: "accountable за слог"),
            .init(settled: "по запуску — кто у нас accountable за слог поддержки?", pending: ""),
        ]),
        .init(speaker: .me, stages: [
            .init(settled: "", pending: "аккаунтбл я по слог"),
            .init(settled: "Accountable — я.", pending: "По слог отвечает"),
            .init(settled: "Accountable — я. По слог отвечает команда Ильи.", pending: ""),
        ]),
        .init(speaker: .them, stages: [
            .init(settled: "", pending: "окей тогда окр на квартал"),
            .init(settled: "Окей. Тогда ОКР на квартал.", pending: "На квартал синхрон"),
            .init(settled: "Окей. Тогда ОКР на квартал. На квартал синхронизируем до пятницы.", pending: ""),
        ]),
        .init(speaker: .me, stages: [
            .init(settled: "", pending: "и ещё по эн пи эс"),
            .init(settled: "И ещё по NPS —", pending: "дашборд кто-то уже уже"),
            .init(settled: "И ещё по NPS — дашборд кто-то уже смотрел?", pending: ""),
        ]),
        .init(speaker: .them, stages: [
            .init(settled: "", pending: "да смотрели в четверг"),
            .init(settled: "Да, смотрели в четверг.", pending: "Просадка в онбординге"),
            .init(settled: "Да, смотрели в четверг. Просадка в онбординге, разберём на ретро.", pending: ""),
        ]),
        .init(speaker: .me, stages: [
            .init(settled: "", pending: "тогда раси соберём"),
            .init(settled: "Тогда RACI соберём", pending: "сегодня до вечера"),
            .init(settled: "Тогда RACI соберём сегодня до вечера.", pending: ""),
        ]),
    ]
}
