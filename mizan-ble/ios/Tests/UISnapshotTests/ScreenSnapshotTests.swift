#if os(iOS)
import ClientUI
import DesignSystem
import HostUI
import SnapshotTesting
import SwiftUI
import Testing
import UIKit

/// Whole screens on the devices they ship to, with each device's real safe
/// area, so a layout that moves on a phone fails here first. Record new
/// references with `SNAPSHOT_RECORD=1`.
@MainActor
@Suite(.snapshots(record: ProcessInfo.processInfo.environment["SNAPSHOT_RECORD"] == "1" ? .all : .missing))
struct ScreenSnapshotTests {

    @Test(arguments: [ColorScheme.light, .dark])
    func hostOnIPad(scheme: ColorScheme) {

        let state = HostState.previews[0].state
        assertScreen(host(state), on: .iPad11, scheme: scheme, named: "host-\(HostState.previews[0].name)")
    }

    @Test(arguments: [ColorScheme.light, .dark])
    func hostOnIPhone(scheme: ColorScheme) {

        let state = HostState.previews[0].state
        assertScreen(host(state), on: .iPhone15Pro, scheme: scheme, named: "host-\(HostState.previews[0].name)")
    }

    @Test(arguments: [ColorScheme.light, .dark])
    func clientOnIPhone(scheme: ColorScheme) {

        let preview = ClientState.previews[0]
        assertScreen(ClientView(state: preview.state, event: { _ in }), on: .iPhone15Pro, scheme: scheme,
                     named: "client-\(preview.name)")
    }

    private func host(_ state: HostState) -> some View {

        HostView(state: state, event: { _ in })
            .environment(\.modeSwitch, .init(side: .host, isEnabled: state.isSettingsEnabled, onSelect: { _ in }))
    }

    private func assertScreen(
        _ view: some View, on device: Device, scheme: ColorScheme, named name: String,
        fileID: StaticString = #fileID, filePath: StaticString = #filePath,
        testName: String = #function, line: UInt = #line, column: UInt = #column
    ) {

        let controller = UIHostingController(rootView: view.transaction { $0.disablesAnimations = true })
        controller.overrideUserInterfaceStyle = scheme == .dark ? .dark : .light
        assertSnapshot(
            of: controller,
            as: .image(on: device.config(scheme), precision: 0.99, perceptualPrecision: 0.98),
            named: "\(name)-\(device.name)-\(scheme == .dark ? "dark" : "light")",
            fileID: fileID, file: filePath, testName: "screen", line: line, column: column
        )
    }
}

/// A device's screen in points, its safe area in portrait or the orientation
/// the app uses on it, and its size classes.
@MainActor
enum Device {

    case iPhone15Pro
    case iPad11

    var name: String { self == .iPhone15Pro ? "iPhone15Pro" : "iPad11" }

    func config(_ scheme: ColorScheme) -> ViewImageConfig {

        let style: UIUserInterfaceStyle = scheme == .dark ? .dark : .light
        switch self {
        case .iPhone15Pro:
            return ViewImageConfig(
                safeArea: UIEdgeInsets(top: 59, left: 0, bottom: 34, right: 0),
                size: CGSize(width: 393, height: 852),
                traits: UITraitCollection { traits in
                    traits.horizontalSizeClass = .compact
                    traits.verticalSizeClass = .regular
                    traits.displayScale = 3
                    traits.userInterfaceIdiom = .phone
                    traits.userInterfaceStyle = style
                }
            )
        case .iPad11:
            // The 11-inch iPad in landscape, as the host stands on the counter.
            return ViewImageConfig(
                safeArea: UIEdgeInsets(top: 24, left: 0, bottom: 20, right: 0),
                size: CGSize(width: 1194, height: 834),
                traits: UITraitCollection { traits in
                    traits.horizontalSizeClass = .regular
                    traits.verticalSizeClass = .regular
                    traits.displayScale = 2
                    traits.userInterfaceIdiom = .pad
                    traits.userInterfaceStyle = style
                }
            )
        }
    }
}
#endif
