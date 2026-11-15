import AppKit
import RenderedText
import SummaryPreviewUI
import SwiftUI
import Testing

@MainActor
struct NotesTemplatePreviewTests {
    @Test(arguments: [false, true]) func nativeMenuDrawsItsSectionItemsAndKeepCheck(keeping: Bool) throws {
        var events: [SummaryPreviewEvent] = []
        let control = NotesMenuControl(text: .init(language: .russian), presentMenu: { _, _ in }, event: { events.append($0) })
        control.show(.init(section: "СДЕЛАТЬ ЗАНОВО", templates: templates(enabled: true), keeping: keeping), text: .init(language: .russian))
        control.performClick(nil)
        let items = control.templateMenu.items
        #expect(items.map(\.title) == ["СДЕЛАТЬ ЗАНОВО", "Default", "Daily", "", "Сохранять прежние итоги"])
        #expect(items[1].state == .off && items[2].state == .off)
        #expect(items[4].state == (keeping ? .on : .off))
        #expect(control.accessibilityIdentifier() == "preview.notesMenu")
        #expect(control.accessibilityLabel() == "Шаблон итогов")
        for item in [items[2], items[4]] { _ = (item.target as? NSObject)?.perform(item.action, with: item) }
        #expect(events == [.openNotesMenu, .chooseTemplate("Daily"), .toggleKeeping])
    }

    @Test func aCallWithoutNotesHasOnlyTheMakeSectionAndTemplates() {
        let control = NotesMenuControl(text: .init(language: .russian), presentMenu: { _, _ in }, event: { _ in })
        control.show(.init(section: "СДЕЛАТЬ", templates: templates(enabled: true), keeping: nil), text: .init(language: .russian))
        #expect(control.templateMenu.items.map(\.title) == ["СДЕЛАТЬ", "Default", "Daily"])
    }

    @Test func busyMenuItemsCannotSendAChoice() {
        var events: [SummaryPreviewEvent] = []
        let control = NotesMenuControl(text: .init(language: .russian), presentMenu: { _, _ in }, event: { events.append($0) })
        control.show(.init(section: "СДЕЛАТЬ ЗАНОВО", templates: templates(enabled: false), keeping: true), text: .init(language: .russian))
        for item in control.templateMenu.items where item.representedObject is String {
            #expect(!item.isEnabled)
            _ = (item.target as? NSObject)?.perform(item.action, with: item)
        }
        #expect(events == [])
    }

    @Test func eachOpeningPresentsOnlyOneRefreshedCatalogue() {
        let text = SummaryPreviewText(language: .russian)
        var events: [SummaryPreviewEvent] = []
        var presented: [[String]] = []
        var anchors: [NSView] = []
        let control = NotesMenuControl(text: text, presentMenu: { menu, view in
            presented.append(menu.items.map(\.title)); anchors.append(view)
        }, event: { events.append($0) })
        var menu = SummaryPreviewState.Menu(section: "СДЕЛАТЬ", templates: templates(enabled: true), keeping: nil, catalogueRevision: 7)
        control.show(menu, text: text)
        control.performClick(nil)
        #expect(events == [.openNotesMenu] && presented.isEmpty)
        menu.catalogueRevision = 6
        control.show(menu, text: text)
        menu.catalogueRevision = 7
        control.show(menu, text: text)
        #expect(presented.isEmpty)
        menu.catalogueRevision = 8
        menu.templates = [.init(id: "Default", name: "Refreshed", enabled: true)]
        control.show(menu, text: text)
        control.show(menu, text: text)
        menu.catalogueRevision = 9
        control.show(menu, text: text)
        #expect(presented == [["СДЕЛАТЬ", "Refreshed"]])
        control.performClick(nil)
        control.show(menu, text: text)
        #expect(presented.count == 1)
        menu.catalogueRevision = 10
        menu.templates[0].name = "Reopened"
        control.show(menu, text: text)
        control.show(menu, text: text)
        #expect(events == [.openNotesMenu, .openNotesMenu])
        #expect(presented == [["СДЕЛАТЬ", "Refreshed"], ["СДЕЛАТЬ", "Reopened"]])
        #expect(anchors.count == 2 && anchors.allSatisfy { $0 === control })
    }

    @Test func versionSwitchSendsTheChosenVersionAndDrawsTheNextSuppliedValue() throws {
        var events: [SummaryPreviewEvent] = []
        let state = try #require(SummaryPreviews.state("templates-current"))
        let host = Offscreen.host(SummaryPreviewView(state: state, event: { events.append($0) }, render: markdown), size: size)
        defer { host.window?.isReleasedWhenClosed = false; host.window?.close() }
        let control = try #require(descendants(host).compactMap { $0 as? NSSegmentedControl }.first)
        #expect(control.accessibilityIdentifier() == "preview.versions")
        #expect(control.selectedSegment == 1)
        #expect([control.label(forSegment: 0), control.label(forSegment: 1)] == ["Предыдущие", "Текущие"])
        control.selectedSegment = 0
        _ = (control.target as? NSObject)?.perform(control.action, with: control)
        #expect(events == [.chooseVersion(.previous)])
        let previous = Offscreen.host(view("templates-previous"), size: size)
        defer { previous.window?.isReleasedWhenClosed = false; previous.window?.close() }
        #expect(Offscreen.textView(in: previous)?.string.contains("Завершить тестирование.") == true)
        #expect(Offscreen.textView(in: previous)?.string.hasSuffix("Шаблон: Default") == true)
    }

    @Test(arguments: [CGFloat(320), 440, 700]) func theSwitchFitsBothNarrowAndWideDetails(width: CGFloat) throws {
        let host = Offscreen.host(view("templates-current"), size: CGSize(width: width, height: size.height))
        defer { host.window?.isReleasedWhenClosed = false; host.window?.close() }
        let control = try #require(descendants(host).compactMap { $0 as? NSSegmentedControl }.first)
        let frame = control.convert(control.bounds, to: host)
        #expect(frame.minX >= 0 && frame.maxX <= width)
    }

    @Test func aSingleVersionHasNoSwitchAndRepeatsItsTemplateInTheFooter() throws {
        let host = Offscreen.host(view("templates-single"), size: size)
        defer { host.window?.isReleasedWhenClosed = false; host.window?.close() }
        #expect(!descendants(host).contains { $0 is NSSegmentedControl })
        #expect(Offscreen.textView(in: host)?.string.hasSuffix("Сделано 17.10, 11:42 · Шаблон: Default") == true)
    }

    @Test func remakingKeepsNotesReadableAndCancelSendsItsInteraction() throws {
        var events: [SummaryPreviewEvent] = []
        let state = try #require(SummaryPreviews.state("templates-remaking"))
        let host = Offscreen.host(SummaryPreviewView(state: state, event: { events.append($0) }, render: markdown), size: size)
        defer { host.window?.isReleasedWhenClosed = false; host.window?.close() }
        #expect(Offscreen.textView(in: host)?.string.contains("Выпустить релиз.") == true)
        let cancel = try #require(descendants(host).compactMap { $0 as? NSButton }.first { $0.accessibilityIdentifier() == "preview.cancel" })
        #expect(cancel.accessibilityPerformPress())
        #expect(events == [.cancelSummary])
    }

    @Test(.disabled(if: SummaryPreviewTests.textViewDiffers, "text views draw differently across macOS releases"),
          arguments: SummaryPreviews.templateStates().map(\.name), [ColorScheme.light, .dark])
    func drawsTemplateStates(name: String, scheme: ColorScheme) throws {
        for language in SummaryPreviewLanguage.allCases {
            let text = SummaryPreviewText(language: language)
            let host = Offscreen.host(view(name, text: text).environment(\.colorScheme, scheme), size: size, scheme: scheme)
            defer { host.window?.isReleasedWhenClosed = false; host.window?.close() }
            let image = try #require(Offscreen.snapshot(host))
            let url = URL(fileURLWithPath: #filePath).deletingLastPathComponent()
                .appendingPathComponent("References/\(name)-\(scheme == .dark ? "dark" : "light")\(language == .russian ? "" : "-en").png")
            #expect([.matches, .recorded].contains(try ReferenceImage.compare(image, with: url)))
            try Offscreen.save(image, "\(name)-\(scheme == .dark ? "dark" : "light")-\(language.rawValue)")
        }
    }

    private let size = CGSize(width: 440, height: 560)
    private func templates(enabled: Bool) -> [SummaryPreviewState.Menu.Template] {
        [.init(id: "Default", name: "Default", enabled: enabled), .init(id: "Daily", name: "Daily", enabled: enabled)]
    }
    private func view(_ name: String, text: SummaryPreviewText = .init(language: .russian)) -> some View {
        SummaryPreviewView(state: SummaryPreviews.state(name, in: text), text: text, event: { _ in }, render: markdown)
    }
    private func descendants(_ view: NSView) -> [NSView] { [view] + view.subviews.flatMap(descendants) }
}
