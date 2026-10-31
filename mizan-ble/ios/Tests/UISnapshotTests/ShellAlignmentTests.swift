#if os(iOS)
import ClientPaymentUI
import ClientUI
import DesignSystem
import HostUI
import SettingsUI
import SwiftUI
import Testing
import UIKit

/// Every iPhone screen keeps the header, the eyebrow row and the actions where
/// the others have them, so moving from one screen to the next moves neither.
@MainActor
struct ShellAlignmentTests {

    @Test func everyIPhoneScreenSharesItsHeaderAndActions() {

        let host = HostState.previews.map { screen("host-\($0.name)", HostView(state: $0.state, event: { _ in }), side: .host) }
            + SettingsState.previews.map { screen("settings-\($0.name)", SettingsView(state: $0.state, event: { _ in }), side: .host) }
        let client = ClientState.previews.map { screen("client-\($0.name)", ClientView(state: $0.state, event: { _ in }), side: .client) }
            + ClientPaymentState.previews.map {
                screen("client-payment-\($0.name)", ClientPaymentView(state: $0.state, event: { _ in }), side: .client)
            }
        let all = host + client
        for screen in all { #expect(screen.frames.count == 3, "\(screen.name) reported \(screen.frames.keys)") }

        // The header, and the foot of the actions, sit in one place on every screen; a screen with
        // two actions grows its stack upward.
        expectOne(all, "header") { $0[.header].map(Pixels.init) }
        expectOne(all, "actions' foot") { $0[.actions].map { Pixels($0.maxY) } }
        // The eyebrow row sits under each side's own steps.
        expectOne(host, "host eyebrow") { $0[.eyebrow].map(Pixels.init) }
        expectOne(client, "client eyebrow") { $0[.eyebrow].map(Pixels.init) }
    }

    private func expectOne<Value: Hashable>(
        _ screens: [(name: String, frames: [ShellPart: CGRect])], _ part: String,
        _ value: ([ShellPart: CGRect]) -> Value?, sourceLocation: SourceLocation = #_sourceLocation
    ) {

        let first = value(screens[0].frames)
        for screen in screens where value(screen.frames) != first {
            let moved = String(describing: value(screen.frames)), expected = String(describing: first)
            Issue.record("\(screen.name) moves the \(part): \(moved), not \(expected) as on \(screens[0].name)",
                         sourceLocation: sourceLocation)
        }
    }

    private func screen(_ name: String, _ view: some View, side: Side) -> (name: String, frames: [ShellPart: CGRect]) {

        let modeSwitch = ModeSwitchConfiguration(side: side, isEnabled: true, onSelect: { _ in })
        return (name, frames(of: view.environment(\.modeSwitch, modeSwitch)))
    }

    /// Lays the screen out in a window the size of an iPhone 15 Pro and returns
    /// where its shell drew each part.
    private func frames(of view: some View) -> [ShellPart: CGRect] {

        var frames: [ShellPart: CGRect] = [:]
        let controller = UIHostingController(rootView: view.environment(\.shellFrames) { frames[$0] = $1 })
        let window = UIWindow(frame: CGRect(x: 0, y: 0, width: 393, height: 852))
        window.rootViewController = controller
        window.isHidden = false
        controller.view.layoutIfNeeded()
        window.isHidden = true
        return frames
    }
}
/// A length or a frame in whole device pixels on a 3x screen, so layout's
/// floating-point noise does not count as a move.
private struct Pixels: Hashable, CustomStringConvertible {
    let values: [Int]

    init(_ length: CGFloat) { values = [Int((length * 3).rounded())] }
    init(_ frame: CGRect) {
        values = [frame.minX, frame.minY, frame.width, frame.height].map { Int(($0 * 3).rounded()) }
    }

    var description: String { values.map { "\(Double($0) / 3)" }.joined(separator: ", ") }
}
#endif
