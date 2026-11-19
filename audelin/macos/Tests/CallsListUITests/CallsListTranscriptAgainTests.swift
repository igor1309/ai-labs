import AppKit
import CallsListUI
import GlassLedger
import RenderedText
import SwiftUI
import Testing

@MainActor
struct CallsListTranscriptAgainTests {
    @Test func S2_disabledRunExplainsTheSuppliedReason() throws {
        var state = CallsListPreviews.state("notes")
        state.rows[1].transcriptAgain = .unavailable("Нет дорожки звонка B")
        let host = host(state)
        defer { close(host) }
        let menu = try menu(state.rows[1].id, in: host)
        let item = try #require(menu.items.first { $0.title == "Распознать заново" })
        #expect(item.accessibilityIdentifier() == "calls.transcriptAgain.\(state.rows[1].id)")
        #expect(!item.isEnabled)
        #expect(!item.accessibilityPerformPress())
        #expect(item.toolTip == "Нет дорожки звонка B")
        #expect(item.accessibilityHelp() == "Нет дорожки звонка B")
    }

    @Test func S10_runMenuItemSendsTheSecondRowsCall() throws {
        let state = CallsListPreviews.state("notes")
        var sent: [CallsListEvent] = []
        let host = host(state) { sent.append($0) }
        defer { close(host) }
        let menu = try menu(state.rows[1].id, in: host)
        let index = try #require(menu.items.firstIndex { $0.title == "Распознать заново" })
        #expect(menu.items[index].accessibilityPerformPress())
        #expect(sent == [.select(state.rows[1].id), .makeTranscriptAgain(state.rows[1].id)])
    }

    @Test func S11_restoreMenuItemSendsItsRowsCall() throws {
        let preview = CallsListPreviews.transcriptMenuStates(in: text)[2]
        var sent: [CallsListEvent] = []
        let host = host(preview.state) { sent.append($0) }
        defer { close(host) }
        let menu = try menu(preview.rowID, in: host)
        let index = try #require(menu.items.firstIndex { $0.title == "Вернуть прежний транскрипт" })
        #expect(menu.items[index].accessibilityIdentifier() == "calls.restoreTranscript.\(preview.rowID)")
        #expect(menu.items[index].accessibilityPerformPress())
        #expect(sent == [.select(preview.rowID), .restorePreviousTranscript(preview.rowID)])
    }

    @Test func S12_cancelAndRetrySendOnlyTheirIntents() throws {
        var sent: [CallsListEvent] = []
        for (name, identifier) in [("transcript-hearing", "calls.cancelTranscript.2026.10.21-1230"),
                                   ("transcript-failed", "calls.retryTranscript.2026.10.21-1230")] {
            let shown = CallsListNotesTests.Shown(CallsListPreviews.state(name))
            defer { shown.close() }
            let target = try #require(shown.target("2026.10.21-1230"))
            let window = try #require(target.window)
            let content = try #require(window.contentView)
            let button = try #require(accessible(identifier, in: content))
            #expect(button.accessibilityPerformPress())
            sent += shown.sent
        }
        #expect(sent == [.cancelTranscriptAgain, .retryTranscriptAgain("2026.10.21-1230")])
    }

    @Test func S13_disabledRestoreExplainsTheSuppliedReason() throws {
        let preview = CallsListPreviews.transcriptMenuStates(in: text)[3]
        let host = host(preview.state)
        defer { close(host) }
        let menu = try menu(preview.rowID, in: host)
        let item = try #require(menu.items.first { $0.title == "Вернуть прежний транскрипт" })
        #expect(!item.isEnabled)
        #expect(!item.accessibilityPerformPress())
        #expect(item.accessibilityHelp() == "Уже идёт распознавание.")
        #expect(item.toolTip == item.accessibilityHelp())
    }

    @Test(.disabled(if: CallsListPreviewTests.searchFieldDiffers, "the search field draws differently across macOS releases"),
          arguments: CallsListPreviews.transcriptStates(in: .init(language: .russian)).map(\.name), [ColorScheme.light, .dark])
    func S5_S6_S7_S8_S9_S14_rowsAndBannersDrawAsReference(name: String, scheme: ColorScheme) throws {
        for language in CallsListLanguage.allCases {
            let text = CallsListText(language: language)
            let host = Offscreen.host(CallsListView(state: CallsListPreviews.state(name, in: text), text: text, event: { _ in })
                .environment(\.colorScheme, scheme).environment(\.controlActiveState, .key),
                size: CGSize(width: 920, height: 420), scheme: scheme)
            defer { close(host) }
            try compare(host, name: name, scheme: scheme, language: language)
        }
    }

    @Test(.disabled(if: CallsListPreviewTests.searchFieldDiffers, "the search field draws differently across macOS releases"),
          arguments: [CGFloat(280), 340, 560], [ColorScheme.light, .dark])
    func hearingFitsTheListWidth(width: CGFloat, scheme: ColorScheme) throws {
        let host = Offscreen.host(CallsListView(state: CallsListPreviews.state("transcript-hearing"), text: text, event: { _ in })
            .environment(\.colorScheme, scheme), size: CGSize(width: width, height: 420), scheme: scheme)
        defer { close(host) }
        try compare(host, name: "transcript-hearing-\(Int(width))", scheme: scheme, language: .russian)
    }

    @Test(arguments: CallsListPreviews.transcriptMenuStates(in: .init(language: .russian)).map(\.name), [ColorScheme.light, .dark])
    func S1_S3_S4_menuDrawsAsItsReference(name: String, scheme: ColorScheme) throws {
        for language in CallsListLanguage.allCases {
            let text = CallsListText(language: language)
            let item = try #require(CallsListPreviews.transcriptMenuStates(in: text).first { $0.name == name })
            let host = Offscreen.host(CallsListMenuPreview(state: item.state, rowID: item.rowID, text: text)
                .environment(\.colorScheme, scheme), size: CGSize(width: 380, height: 180), scheme: scheme)
            defer { close(host) }
            try compare(host, name: name, scheme: scheme, language: language)
        }
    }

    private let text = CallsListText(language: .russian)

    private func compare(_ host: NSView, name: String, scheme: ColorScheme, language: CallsListLanguage) throws {
        let image = try #require(Offscreen.snapshot(host))
        let filename = "\(name)-\(scheme == .dark ? "dark" : "light")\(language == .english ? "-en" : "")"
        let url = URL(fileURLWithPath: #filePath).deletingLastPathComponent().appendingPathComponent("References/\(filename).png")
        #expect([.matches, .recorded].contains(try ReferenceImage.compare(image, with: url)))
        try Offscreen.save(image, filename)
    }

    private func host(_ state: CallsListState, event: @escaping (CallsListEvent) -> Void = { _ in }) -> NSView {
        GlassLedger.registerFonts()
        return Offscreen.host(CallsListView(state: state, text: text, event: event), size: CGSize(width: 920, height: 420))
    }

    private func close(_ host: NSView) { host.window?.isReleasedWhenClosed = false; host.window?.close() }

    private func menu(_ id: String, in host: NSView) throws -> NSMenu {
        let target = try #require(descendants(host).first { $0.accessibilityIdentifier() == "calls.row.\(id)" })
        let click = try #require(NSEvent.mouseEvent(with: .rightMouseDown, location: .zero, modifierFlags: [], timestamp: 0,
                                                   windowNumber: 0, context: nil, eventNumber: 0, clickCount: 1, pressure: 1))
        return try #require(target.menu(for: click))
    }

    private func accessible(_ identifier: String, in element: any NSAccessibilityProtocol) -> (any NSAccessibilityProtocol)? {
        if element.accessibilityIdentifier() == identifier { return element }
        if let view = element as? NSView, let button = descendants(view).first(where: { $0.accessibilityIdentifier() == identifier }) {
            return button
        }
        for child in element.accessibilityChildren() ?? [] {
            if let child = child as? any NSAccessibilityProtocol, let found = accessible(identifier, in: child) { return found }
        }
        return nil
    }

    private func descendants(_ view: NSView) -> [NSView] { [view] + view.subviews.flatMap(descendants) }
}
