import AppKit
import CallsListUI
import RenderedText
import SwiftUI
import Testing

@MainActor
struct CallsListSearchTests {
    @Test func typingAndClearingSendTheExactText() throws {
        var events: [CallsListEvent] = []
        let host = host(.init(), event: { events.append($0) })
        let field = try search(in: host)
        for text in ["OKR", " OKR ", ""] {
            field.stringValue = text
            field.sendAction(field.action, to: field.target)
        }
        #expect(events == [.search("OKR"), .search(" OKR "), .search("")])
    }

    @Test func escapeEmptiesTheFieldAndSendsAnEmptySearch() throws {
        var events: [CallsListEvent] = []
        let host = host(.init(searchText: "OKR"), event: { events.append($0) })
        let field = try search(in: host)
        let handled = field.delegate?.control?(field, textView: NSTextView(), doCommandBy: #selector(NSResponder.cancelOperation(_:)))
        #expect(handled == true)
        #expect(field.stringValue.isEmpty)
        #expect(events == [.search("")])
    }

    @Test func theClearButtonSendsAnEmptySearch() throws {
        var events: [CallsListEvent] = []
        let host = host(.init(searchText: "OKR"), event: { events.append($0) })
        let field = try search(in: host)
        let cell = try #require(field.cell as? NSSearchFieldCell)
        try #require(cell.cancelButtonCell).performClick(field)
        #expect(field.stringValue.isEmpty)
        #expect(events == [.search("")])
    }

    @Test func searchStaysAboveTheScrollingRows() throws {
        var state = CallsListPreviews.state("calls")
        state.rows += (0..<30).map { index in
            .init(id: "row-\(index)", title: "Call", displayTitle: "Call", day: nil, time: "10:00", duration: "28:00", editable: true)
        }
        let host = host(state)
        let field = try search(in: host)
        let scroll = try #require(find(NSScrollView.self, in: host).first)
        let before = field.convert(field.bounds, to: host)

        scroll.contentView.scroll(to: NSPoint(x: 0, y: 200))
        scroll.reflectScrolledClipView(scroll.contentView)
        host.layoutSubtreeIfNeeded()

        #expect(scroll.contentView.bounds.origin.y > 0)
        #expect(field.convert(field.bounds, to: host) == before)
        #expect(!field.isDescendant(of: scroll))
        #expect(before.width > 200 && before.maxX < host.bounds.width)
    }

    @Test(arguments: CallsListLanguage.allCases)
    func rendersTheStatesInputAndLocalizedPlaceholder(language: CallsListLanguage) throws {
        let text = CallsListText(language: language)
        let host = host(.init(searchText: " \t "), text: text)
        let field = try search(in: host)
        #expect(field.stringValue == " \t ")
        #expect(field.placeholderString == text(.searchPlaceholder))
        #expect(field.accessibilityLabel() == text(.searchPlaceholder))
    }

    @Test(arguments: [false, true])
    func theFieldShowsProgressOnlyWhileTranscriptsAreRead(searching: Bool) throws {
        let host = host(.init(search: .init(query: "OKR", searching: searching), searchText: "OKR"))
        let spinner = try #require(find(NSProgressIndicator.self, in: host).first { $0.accessibilityIdentifier() == "calls.search.progress" })
        #expect(spinner.isHidden == !searching)
        #expect((try search(in: host).cell as? NSSearchFieldCell)?.searchButtonCell?.isTransparent == searching)
    }

    @Test(arguments: [false, true])
    func tabLeavesTheFieldWhenTheDetailCanTakeFocus(accepted: Bool) throws {
        var requests = 0
        let host = Offscreen.host(CallsListView(state: .init(), text: .init(language: .russian), event: { _ in },
                                               focusDetail: { requests += 1; return accepted }), size: CGSize(width: 340, height: 420))
        let field = try search(in: host)
        for command in [#selector(NSResponder.insertTab(_:)), #selector(NSResponder.insertBacktab(_:))] {
            let handled = field.delegate?.control?(field, textView: NSTextView(), doCommandBy: command)
            #expect(handled == accepted)
        }
        #expect(requests == 2)
    }

    @Test func commandFFocusesTheSearchField() throws {
        let host = host(.init())
        let window = try #require(host.window)
        let field = try search(in: host)
        let key = try #require(NSEvent.keyEvent(with: .keyDown, location: .zero, modifierFlags: .command,
                                               timestamp: 0, windowNumber: window.windowNumber, context: nil,
                                               characters: "f", charactersIgnoringModifiers: "f", isARepeat: false, keyCode: 3))
        #expect(host.performKeyEquivalent(with: key))
        host.layoutSubtreeIfNeeded()
        #expect(window.firstResponder === field.currentEditor())
        #expect(field.currentEditor() != nil)
    }

    private func host(_ state: CallsListState, text: CallsListText = .init(language: .russian),
                      event: @escaping (CallsListEvent) -> Void = { _ in }) -> NSView {
        Offscreen.host(CallsListView(state: state, text: text, event: event), size: CGSize(width: 340, height: 420))
    }

    private func search(in view: NSView) throws -> NSSearchField { try #require(find(NSSearchField.self, in: view).first) }

    private func find<T: NSView>(_ type: T.Type, in view: NSView) -> [T] {
        ((view as? T).map { [$0] } ?? []) + view.subviews.flatMap { find(type, in: $0) }
    }
}
