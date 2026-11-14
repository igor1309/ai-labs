import AppKit
import SwiftUI
import PanelUI
import GlassLedger

@MainActor
func capture() throws {
    let app = NSApplication.shared
    app.setActivationPolicy(.accessory)
    let entries: [PanelState.Entry] = [
        .init(id: 1, time: "12:41", speaker: .them, settled: "Давайте обсудим запуск. Кто отвечает за поддержку после релиза?"),
        .init(id: 2, time: "12:42", speaker: .me, settled: "За поддержку отвечаю я. Сначала проверим latency и error budget."),
        .init(id: 3, time: "12:43", speaker: .them, settled: "Хорошо. Зафиксируем SLA и проверим метрики до пятницы."),
        .init(id: 4, time: "12:44", speaker: .me, settled: "Договорились. Добавим dashboard", pending: " и настроим оповещения"),
    ]
    let named: [PanelState.Entry] = [
        .init(id: 1, time: "12:41", speaker: .them, settled: "Давайте обсудим запуск. Кто отвечает за поддержку после релиза?", label: "Анна Петрова", labelIsTentative: true),
        .init(id: 2, time: "12:42", speaker: .me, settled: "За поддержку отвечаю я. Сначала проверим latency и error budget."),
        .init(id: 3, time: "12:42", speaker: .them, settled: "Метрики я соберу к четвергу, dashboard уже есть.", label: "Борис Ким", labelIsTentative: true),
        .init(id: 4, time: "12:43", speaker: .them, settled: "Хорошо. Зафиксируем SLA и проверим метрики до пятницы.", label: "Анна Петрова", labelIsTentative: true),
        .init(id: 5, time: "12:44", speaker: .me, settled: "Договорились. Добавим dashboard", pending: " и настроим оповещения"),
    ]
    let scenes: [(file: String, state: PanelState)] = [
        ("live.png", PanelState(recording: .on(elapsed: "00:03:24"), log: .lines(.init(entries: entries, holds: [], newBelow: 0, followsLive: true)))),
        ("held.png", PanelState(recording: .on(elapsed: "00:03:24"), log: .lines(.init(entries: entries, holds: [.init(entryID: 2, text: "latency и error budget")], newBelow: 2, followsLive: false)))),
        ("speakers-live.png", PanelState(recording: .on(elapsed: "00:03:24"), log: .lines(.init(entries: named, holds: [], newBelow: 0, followsLive: true)))),
    ]
    for (file, state) in scenes {
        let view = NSHostingView(rootView: PanelView(state: state, event: { _ in }).padding(20).background(GlassLedger.for(.light).back).environment(\.colorScheme, .light))
        let rect = NSRect(x: 0, y: 0, width: 620, height: 600)
        let window = NSWindow(contentRect: rect, styleMask: [.borderless], backing: .buffered, defer: false)
        window.contentView = view
        window.orderFront(nil)
        RunLoop.main.run(until: Date().addingTimeInterval(1))
        view.layoutSubtreeIfNeeded()
        guard let bitmap = view.bitmapImageRepForCachingDisplay(in: view.bounds) else { fatalError("No bitmap") }
        view.cacheDisplay(in: view.bounds, to: bitmap)
        let data = bitmap.representation(using: .png, properties: [:])!
        try data.write(to: URL(filePath: CommandLine.arguments[1]).appendingPathComponent(file))
        window.orderOut(nil)
    }
}
try capture()
