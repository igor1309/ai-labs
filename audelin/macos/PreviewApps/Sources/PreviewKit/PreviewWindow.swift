import AppKit
import SwiftUI

/// The shell every preview app shares: the feature under test on the left,
/// over the desktop tint, and the mock's controls on the right.
///
/// The appearance picker switches the feature, not the controls, between
/// light and dark.
public struct PreviewWindow<Feature: View, Controls: View>: View {

    private let backdrop: (ColorScheme) -> Color
    private let feature: () -> Feature
    private let controls: () -> Controls

    @State private var scheme: ColorScheme = .light

    public init(
        backdrop: @escaping (ColorScheme) -> Color,
        @ViewBuilder feature: @escaping () -> Feature,
        @ViewBuilder controls: @escaping () -> Controls
    ) {
        self.backdrop = backdrop
        self.feature = feature
        self.controls = controls
    }

    public var body: some View {

        HStack(spacing: 0) {

            feature()
                .padding(24)
                .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
                .background(backdrop(scheme))
                .environment(\.colorScheme, scheme)

            Divider()

            Form {

                Picker("Appearance", selection: $scheme) {
                    Text("Light").tag(ColorScheme.light)
                    Text("Dark").tag(ColorScheme.dark)
                }
                .pickerStyle(.segmented)

                controls()
            }
            .formStyle(.grouped)
            .frame(width: 280)
        }
    }
}

public enum PreviewApp {

    /// Makes an app started with `swift run` a regular app in front: an
    /// executable without a bundle starts in the background, with no Dock icon.
    @MainActor
    public static func bringToFront() {

        NSApplication.shared.setActivationPolicy(.regular)
        NSApplication.shared.activate()
    }
}
