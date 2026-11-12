import AppKit
import SwiftUI

/// Native search semantics, with input rendered from the list's state.
struct CallsSearchField: NSViewRepresentable {
    let text: String
    let placeholder: String
    let searching: Bool
    let focusRequest: Int
    let changed: (String) -> Void
    let focusDetail: (() -> Bool)?

    func makeCoordinator() -> Coordinator { Coordinator(changed: changed, focusDetail: focusDetail) }

    func makeNSView(context: Context) -> SearchField {
        let field = SearchField()
        field.target = context.coordinator
        field.action = #selector(Coordinator.changed(_:))
        field.delegate = context.coordinator
        return field
    }

    func sizeThatFits(_ proposal: ProposedViewSize, nsView: SearchField, context: Context) -> CGSize? {
        CGSize(width: proposal.width ?? nsView.intrinsicContentSize.width, height: proposal.height ?? nsView.intrinsicContentSize.height)
    }

    func updateNSView(_ field: SearchField, context: Context) {
        context.coordinator.send = changed
        context.coordinator.focusDetail = focusDetail
        if field.stringValue != text { field.stringValue = text }
        field.placeholderString = placeholder
        field.setAccessibilityLabel(placeholder)
        (field.cell as? NSSearchFieldCell)?.searchButtonCell?.isTransparent = searching
        field.spinner.isHidden = !searching
        if searching { field.spinner.startAnimation(nil) } else { field.spinner.stopAnimation(nil) }
        if context.coordinator.focusRequest != focusRequest {
            context.coordinator.focusRequest = focusRequest
            field.window?.makeFirstResponder(field)
        }
    }

    final class Coordinator: NSObject, NSSearchFieldDelegate {
        var send: (String) -> Void
        var focusDetail: (() -> Bool)?
        var focusRequest = 0
        init(changed: @escaping (String) -> Void, focusDetail: (() -> Bool)?) { send = changed; self.focusDetail = focusDetail }
        @objc func changed(_ field: NSSearchField) { send(field.stringValue) }

        func control(_ control: NSControl, textView: NSTextView, doCommandBy commandSelector: Selector) -> Bool {
            if commandSelector == #selector(NSResponder.insertTab(_:)) || commandSelector == #selector(NSResponder.insertBacktab(_:)) {
                return focusDetail?() == true
            }
            guard commandSelector == #selector(NSResponder.cancelOperation(_:)), let field = control as? NSSearchField else { return false }
            field.stringValue = ""
            send("")
            return true
        }
    }

    final class SearchField: NSSearchField {
        let spinner = NSProgressIndicator()
        init() {
            super.init(frame: .zero)
            sendsSearchStringImmediately = true
            setAccessibilityIdentifier("calls.search")
            spinner.style = .spinning
            spinner.controlSize = .small
            spinner.isDisplayedWhenStopped = false
            spinner.setAccessibilityIdentifier("calls.search.progress")
            spinner.translatesAutoresizingMaskIntoConstraints = false
            addSubview(spinner)
            NSLayoutConstraint.activate([
                spinner.leadingAnchor.constraint(equalTo: leadingAnchor, constant: 6),
                spinner.centerYAnchor.constraint(equalTo: centerYAnchor),
                spinner.widthAnchor.constraint(equalToConstant: 16),
                spinner.heightAnchor.constraint(equalToConstant: 16),
            ])
        }
        @available(*, unavailable) required init?(coder: NSCoder) { fatalError("init(coder:) is not used") }
    }
}
