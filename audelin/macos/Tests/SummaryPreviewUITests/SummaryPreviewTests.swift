import AppKit
import GlassLedger
import NotesMarkdown
import RenderedText
import SummaryPreviewUI
import SwiftUI
import Testing

@MainActor
struct SummaryPreviewTests {

    /// The notes are laid out by an AppKit text view, whose glyph placement
    /// changes between macOS releases even in the bundled Plex fonts, so their
    /// reference images hold only on the Mac that recorded them; CI runs a
    /// different release and checks layout instead.
    nonisolated static let textViewDiffers = ProcessInfo.processInfo.environment["GITHUB_ACTIONS"] != nil

    @Test(.disabled(if: textViewDiffers, "text views draw differently across macOS releases"),
          arguments: SummaryPreviews.states.map(\.name), [ColorScheme.light, .dark])
    func drawsAsItsReference(name: String, scheme: ColorScheme) throws {

        for language in SummaryPreviewLanguage.allCases { try draws(name, scheme, SummaryPreviewText(language: language)) }
    }

    private func draws(_ name: String, _ scheme: ColorScheme, _ text: SummaryPreviewText) throws {

        let host = Offscreen.host(view(SummaryPreviews.state(name, in: text), text: text, scheme: scheme), size: size, scheme: scheme)
        let image = try #require(Offscreen.snapshot(host))
        let url = URL(fileURLWithPath: #filePath).deletingLastPathComponent()
            .appendingPathComponent("References/\(name)-\(scheme == .dark ? "dark" : "light")\(text.language == .russian ? "" : "-en").png")

        let outcome = try ReferenceImage.compare(image, with: url)
        #expect([.matches, .recorded].contains(outcome))
    }

    @Test func anySelectedPartCopiesExactlyThatPart() throws {

        let host = Offscreen.host(view(SummaryPreviews.state("notes")), size: size)
        let text = try #require(Offscreen.textView(in: host))
        let pasteboard = NSPasteboard.withUniqueName()
        defer { pasteboard.releaseGlobally() }
        let range = (text.string as NSString).range(of: "дашборд NPS")

        #expect(text.isSelectable && !text.isEditable)
        text.setSelectedRange(range)
        #expect(text.writeSelection(to: pasteboard, types: text.writablePasteboardTypes))
        #expect(pasteboard.string(forType: .string) == "дашборд NPS")
    }

    @Test func pressingCopyAsksToCopyTheNotes() throws {

        var copies = 0
        click(copyLocation, on: SummaryPreviewView(state: SummaryPreviews.state("notes"), event: { if $0 == .copy { copies += 1 } }, render: markdown))

        #expect(copies == 1)
    }

    @Test(arguments: [false, true])
    func theMoreMenuListsTheCallsActionsInTheLedgerTypeAndReportsEach(canRetry: Bool) throws {

        var state = try #require(SummaryPreviews.state("notes"))
        state.canRetry = canRetry
        var events: [SummaryPreviewEvent] = []
        let host = Offscreen.host(SummaryPreviewView(state: state, event: { events.append($0) }, render: markdown), size: size)
        let menu = try #require(popUps(in: host).first)
        let entries = menu.itemArray.dropFirst().filter { !$0.isSeparatorItem }
        let tokens = GlassLedger.for(.light)

        #expect(menu.pullsDown && popUps(in: host).count == 1)
        let titles: [String] = canRetry ? ["Открыть", "Переименовать", "Повторить итоги", "Удалить…"] : ["Открыть", "Переименовать", "Удалить…"]
        let separators: [Bool] = canRetry ? [false, false, false, true, false] : [false, false, true, false]
        #expect(entries.map(\.title) == titles)
        #expect(menu.itemArray.dropFirst().map(\.isSeparatorItem) == separators)
        for entry in entries {
            let ink = entry.attributedTitle?.attribute(.foregroundColor, at: 0, effectiveRange: nil) as? NSColor
            #expect(entry.attributedTitle?.attribute(.font, at: 0, effectiveRange: nil) as? NSFont == tokens.nsUi(tokens.typeSmall))
            #expect(ink == NSColor(entry.title == "Удалить…" ? tokens.rec : tokens.text))
        }
        for entry in entries { menu.menu?.performActionForItem(at: menu.menu!.index(of: entry)) }

        let expected: [SummaryPreviewEvent] = canRetry ? [.open, .rename, .retrySummary, .delete] : [.open, .rename, .delete]
        #expect(events == expected)
    }

    @Test func aFailedSummaryOffersToRetryIt() throws {

        var events: [SummaryPreviewEvent] = []
        click(retryLocation, on: SummaryPreviewView(state: SummaryPreviews.state("failed"), event: { events.append($0) }, render: markdown))

        #expect(events == [.retrySummary])
    }

    @Test(arguments: ["preparing", "failed", "no-summary", "notes-off", "no-selection"])
    func aMessageInPlaceOfNotesHasNoCopyNoMenuAndNoText(name: String) throws {

        var events: [SummaryPreviewEvent] = []
        let state = SummaryPreviews.state(name)
        let host = Offscreen.host(SummaryPreviewView(state: state, event: { events.append($0) }, render: markdown), size: size)
        click(copyLocation, on: SummaryPreviewView(state: state, event: { events.append($0) }, render: markdown))

        #expect(popUps(in: host).isEmpty)
        #expect(Offscreen.textView(in: host) == nil)
        #expect(events.isEmpty)
    }

    @Test func unreadableNotesHaveNoMoreMenu() throws {

        let host = Offscreen.host(view(SummaryPreviews.state("unreadable")), size: size)

        #expect(popUps(in: host).isEmpty)
    }

    @Test func unreadableNotesHaveNoCopyButton() throws {

        var copies = 0
        click(copyLocation, on: SummaryPreviewView(state: SummaryPreviews.state("unreadable"), event: { if $0 == .copy { copies += 1 } }, render: markdown))

        #expect(copies == 0)
    }

    @Test func aLongSummaryWrapsInsideANarrowWindow() throws {

        let narrow = CGSize(width: 320, height: 900)
        let host = Offscreen.host(view(SummaryPreviews.state("daily")), size: narrow)
        let text = try #require(Offscreen.textView(in: host))
        let used = try #require(text.layoutManager.map { $0.usedRect(for: text.textContainer!) })

        #expect(text.isSelectable && !text.isEditable)
        #expect(text.frame.width <= narrow.width)
        #expect(used.maxX + text.textContainerInset.width <= narrow.width)
        #expect(text.string.contains("О ЧЁМ ВСТРЕЧА") && text.string.contains("OTP-кода"))
    }

    @Test(.disabled(if: textViewDiffers, "text views draw differently across macOS releases"),
          arguments: [ColorScheme.light, .dark])
    func aLongSummaryDrawsInANarrowWindow(scheme: ColorScheme) throws {

        let narrow = CGSize(width: 320, height: 900)
        let host = Offscreen.host(view(SummaryPreviews.state("daily"), scheme: scheme), size: narrow, scheme: scheme)
        let image = try #require(Offscreen.snapshot(host))
        let url = URL(fileURLWithPath: #filePath).deletingLastPathComponent()
            .appendingPathComponent("References/daily-narrow-\(scheme == .dark ? "dark" : "light").png")

        let outcome = try ReferenceImage.compare(image, with: url)
        #expect([.matches, .recorded].contains(outcome))
    }

    @Test func theNotesAreSetInTheAppsTypeScale() throws {

        var calls: [(source: String, style: NotesStyle)] = []
        let rendered = NSAttributedString(string: "отрисовано")
        let view = SummaryPreviewView(state: SummaryPreviews.state("notes"), event: { _ in }) { source, style in
            calls.append((source, style)); return rendered
        }
        let host = Offscreen.host(view, size: size)
        let text = try #require(Offscreen.textView(in: host))
        let tokens = GlassLedger.for(.light)

        let call = try #require(calls.last)
        #expect(call.source == SummaryPreviews.notes)
        let sans = tokens.fontUi, mono = tokens.fontData
        #expect(call.style.body.familyName == sans && call.style.body.pointSize == tokens.typeBody)
        #expect(call.style.lineHeight == tokens.lineBody)
        #expect(call.style.code.familyName == mono)
        #expect(call.style.headings[1].familyName == sans && call.style.headings[1].pointSize == tokens.typeCaption)
        #expect(call.style.labelLevels == [2])
        #expect(call.style.headings[2].familyName == sans && call.style.headings[2].pointSize == tokens.typeBody)
        #expect(call.style.text == NSColor(tokens.text))
        #expect(call.style.secondary == NSColor(tokens.sub))
        #expect(text.string == "отрисовано")
    }

    @Test func unreadableNotesRenderNothing() throws {

        var calls = 0
        let view = SummaryPreviewView(state: SummaryPreviews.state("unreadable"), event: { _ in }) { _, _ in calls += 1; return .init() }
        _ = Offscreen.host(view, size: size)

        #expect(calls == 0)
    }

    @Test func unreadableNotesOfferNoTextAndNoCopy() throws {

        let host = Offscreen.host(view(SummaryPreviews.state("unreadable")), size: size)

        #expect(Offscreen.textView(in: host) == nil)
    }

    // MARK: - Helpers

    private let size = CGSize(width: 440, height: 560)

    /// Inside Копировать, left of ⋯ at the bar's right end.
    private var copyLocation: NSPoint { NSPoint(x: size.width - 16 - 30 - 8 - 40, y: size.height - 22) }

    /// Повторить итоги, the last line of the failed message centred below the header.
    private var retryLocation: NSPoint { NSPoint(x: size.width / 2, y: 172) }

    private func view(_ state: SummaryPreviewState?, text: SummaryPreviewText = .init(language: .russian), scheme: ColorScheme = .light) -> some View {
        SummaryPreviewView(state: state, text: text, event: { _ in }, render: markdown).environment(\.colorScheme, scheme)
    }

    private func popUps(in view: NSView) -> [NSPopUpButton] {
        ((view as? NSPopUpButton).map { [$0] } ?? []) + view.subviews.flatMap { popUps(in: $0) }
    }

    private func click(_ location: NSPoint, on view: SummaryPreviewView) {
        let window = NSWindow(contentRect: NSRect(x: -30_000, y: -30_000, width: size.width, height: size.height),
                              styleMask: .borderless, backing: .buffered, defer: false)
        window.isReleasedWhenClosed = false
        defer { window.close() }
        window.contentView = NSHostingView(rootView: view)
        window.orderFrontRegardless()
        RunLoop.main.run(until: Date() + 0.15)
        for type in [NSEvent.EventType.leftMouseDown, .leftMouseUp] {
            window.sendEvent(NSEvent.mouseEvent(with: type, location: location, modifierFlags: [], timestamp: ProcessInfo.processInfo.systemUptime,
                                                windowNumber: window.windowNumber, context: nil, eventNumber: 0, clickCount: 1, pressure: 1)!)
        }
        RunLoop.main.run(until: Date() + 0.15)
    }
}

/// The renderer the app composes the view with.
private func markdown(_ source: String, _ style: NotesStyle) -> NSAttributedString {
    NotesMarkdown.render(source, style: .init(body: style.body, headings: style.headings, code: style.code, text: style.text,
                                              secondary: style.secondary, codeBackground: style.codeBackground, rule: style.rule,
                                              layout: .init(lineHeight: style.lineHeight, paragraphSpacing: style.paragraphSpacing,
                                                            headingSpacing: style.headingSpacing, labelLevels: style.labelLevels,
                                                            labelKern: style.labelKern)))
}
