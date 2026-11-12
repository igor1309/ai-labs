import AppKit
import CallsWindowUI
import SummaryPreviewUI
import Testing

@MainActor
struct CallsToolbarTests {

    @Test func putsTheRowActionsOverTheListAndCopyTrailingOverTheDetail() throws {
        let split = makeCallsSplit(list: NSView(), detail: NSView())
        let sut = CallsToolbar(identifier: "test", splitView: split.splitView, title: "Звонки", text: .init(language: .russian), act: { _ in })

        #expect(sut.toolbarDefaultItemIdentifiers(sut.toolbar)
                == [CallsToolbar.titleItem, .flexibleSpace, CallsToolbar.actionsItem, CallsToolbar.deleteItem, CallsToolbar.separatorItem, .flexibleSpace, CallsToolbar.copyItem])
        let separator = try #require(item(sut, CallsToolbar.separatorItem) as? NSTrackingSeparatorToolbarItem)
        #expect(separator.splitView === split.splitView)
        #expect(separator.dividerIndex == 0)
    }

    @Test func theListTitleFollowsItsLanguage() throws {
        let split = makeCallsSplit(list: NSView(), detail: NSView())
        let sut = CallsToolbar(identifier: "test", splitView: split.splitView, title: "Звонки", text: .init(language: .russian), act: { _ in })
        let label = try #require(item(sut, CallsToolbar.titleItem)?.view as? NSTextField)
        #expect(label.stringValue == "Звонки")
        sut.retitle(text: .init(language: .english), title: "Calls")
        #expect(label.stringValue == "Calls")
    }

    @Test func theCallsOwnWindowHasTheButtonsAndNoSeparator() {
        let sut = makeSUT()

        #expect(sut.toolbarDefaultItemIdentifiers(sut.toolbar)
                == [CallsToolbar.actionsItem, CallsToolbar.deleteItem, .flexibleSpace, CallsToolbar.copyItem])
    }

    @Test func eachButtonNamesItselfInItsTooltipAndReportsItsAction() throws {
        var events: [SummaryPreviewEvent] = []
        let sut = makeSUT(act: { events.append($0) })
        sut.show(.init(call: true, copy: true))
        let buttons = try self.buttons(sut)

        #expect(buttons.map(\.toolTip) == ["Копировать", "Открыть", "Переименовать", "Удалить…"])
        for item in buttons { _ = (item.target as? NSObject)?.perform(item.action, with: item) }
        #expect(events == [.copy, .open, .rename, .delete])
    }

    @Test func retitlesTheButtons() throws {
        let sut = makeSUT()

        sut.retitle(text: .init(language: .english))

        #expect(try buttons(sut).map(\.toolTip) == ["Copy", "Open", "Rename", "Delete…"])
    }

    @Test(arguments: [(CallActions(call: false, copy: false), [false, false, false, false]),
                      (CallActions(call: true, copy: false), [false, true, true, true]),
                      (CallActions(call: true, copy: true), [true, true, true, true])])
    func enablesOnlyTheButtonsThatActOnTheCallShown(actions: CallActions, enabled: [Bool]) throws {
        let sut = makeSUT()

        let window = NSWindow(contentRect: NSRect(x: 0, y: 0, width: 600, height: 400),
                              styleMask: [.titled], backing: .buffered, defer: false)
        window.isReleasedWhenClosed = false
        defer { window.close() }
        window.toolbar = sut.toolbar
        sut.show(actions)
        sut.toolbar.validateVisibleItems()

        #expect(try buttons(sut).map(\.isEnabled) == enabled)
    }

    @Test func copyNeedsNotesAndTheRestNeedACall() {
        func state(_ notes: SummaryPreviewState.Notes) -> SummaryPreviewState {
            .init(title: "Zoom", date: "Сегодня, 10:00", duration: "28:00", notes: notes)
        }

        #expect(callActions(nil) == .init(call: false, copy: false))
        #expect(callActions(state(.markdown("# A", made: nil))) == .init(call: true, copy: true))
        for notes in [SummaryPreviewState.Notes.unreadable("x"), .making, .failed("x"), .none] {
            #expect(callActions(state(notes)) == .init(call: true, copy: false))
        }
    }

    @Test(.timeLimit(.minutes(1))) func copyShowsACheckmarkUntilItSettles() async throws {
        let (started, start) = AsyncStream.makeStream(of: Void.self)
        let (settled, settle) = AsyncStream.makeStream(of: Void.self)
        nonisolated(unsafe) var waits = settled.makeAsyncIterator()
        let sut = CallsToolbar(identifier: "test", text: .init(language: .russian), act: { _ in },
                               settle: { start.yield(); _ = await waits.next() })
        let copy = try #require(item(sut, CallsToolbar.copyItem))
        func shows(_ symbol: String) -> Bool {
            copy.image?.tiffRepresentation == NSImage(systemSymbolName: symbol, accessibilityDescription: nil)?.tiffRepresentation
        }
        #expect(shows(CallsToolbar.copySymbol))

        _ = (copy.target as? NSObject)?.perform(copy.action, with: copy)
        #expect(shows(CallsToolbar.copiedSymbol))
        #expect(copy.image?.accessibilityDescription == "Копировать")

        var starts = started.makeAsyncIterator()
        _ = await starts.next()
        settle.yield()
        while !shows(CallsToolbar.copySymbol) { await Task.yield() }
    }

    private func makeSUT(act: @escaping (SummaryPreviewEvent) -> Void = { _ in }) -> CallsToolbar {
        CallsToolbar(identifier: "test", text: .init(language: .russian), act: act)
    }

    private func item(_ sut: CallsToolbar, _ identifier: NSToolbarItem.Identifier) -> NSToolbarItem? {
        sut.toolbar(sut.toolbar, itemForItemIdentifier: identifier, willBeInsertedIntoToolbar: true)
    }

    private func buttons(_ sut: CallsToolbar) throws -> [NSToolbarItem] {
        let group = try #require(item(sut, CallsToolbar.actionsItem) as? NSToolbarItemGroup)
        return [try #require(item(sut, CallsToolbar.copyItem))] + group.subitems + [try #require(item(sut, CallsToolbar.deleteItem))]
    }

}
