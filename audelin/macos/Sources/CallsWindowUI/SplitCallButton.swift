import AppKit
import GlassLedger
import SwiftUI

public enum SplitControl: Equatable, Sendable {
    case available
    case unavailable(String?)
}

final class SplitCallButton: NSButton {
    init(target: AnyObject?, action: Selector?) {
        super.init(frame: .zero)
        self.target = target
        self.action = action
        bezelStyle = .toolbar
        imagePosition = .imageOnly
        setAccessibilityIdentifier("calls.split")
        updateTint()
    }

    @available(*, unavailable) required init?(coder: NSCoder) { fatalError("init(coder:) is not used") }

    override func viewDidChangeEffectiveAppearance() {
        super.viewDidChangeEffectiveAppearance()
        updateTint()
    }

    private func updateTint() {
        let dark = effectiveAppearance.bestMatch(from: [.darkAqua, .aqua]) == .darkAqua
        let tokens = GlassLedger.for(dark ? .dark : .light)
        let ink = NSColor(isEnabled ? tokens.text : tokens.disText)
        let symbol = NSImage(systemSymbolName: "scissors", accessibilityDescription: nil)?
            .withSymbolConfiguration(.init(paletteColors: [ink]))
        symbol?.isTemplate = false
        image = symbol
    }

    func show(_ control: SplitControl, title: String) {
        let available = control == .available
        if isEnabled != available {
            isEnabled = available
            updateTint()
        }
        let reason: String?
        if case let .unavailable(message) = control { reason = message } else { reason = nil }
        toolTip = reason ?? title
        setAccessibilityLabel(title)
        setAccessibilityHelp(toolTip)
        setAccessibilityValue(toolTip)
    }
}
