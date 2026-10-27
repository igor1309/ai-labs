import AppKit
import SwiftUI

/// Keeps the feature at device dimensions while fitting it to the window.
public struct PreviewWindow<Feature: View, Controls: View>: View {
    private let device: PreviewDeviceSize
    private let events: [String]
    private let backdrop: (ColorScheme) -> Color
    private let feature: () -> Feature
    private let controls: () -> Controls

    @State private var scheme: ColorScheme = .light

    public init(
        device: PreviewDeviceSize,
        events: [String],
        backdrop: @escaping (ColorScheme) -> Color,
        @ViewBuilder feature: @escaping () -> Feature,
        @ViewBuilder controls: @escaping () -> Controls
    ) {
        self.device = device
        self.events = events
        self.backdrop = backdrop
        self.feature = feature
        self.controls = controls
    }

    public var body: some View {
        HStack(spacing: 0) {
            GeometryReader { geometry in
                let size = device.size
                let scale = max(0, min(
                    (geometry.size.width - 48) / size.width,
                    (geometry.size.height - 48) / size.height
                ))
                feature()
                    .frame(width: size.width, height: size.height)
                    .scaleEffect(scale)
                    .frame(width: size.width * scale, height: size.height * scale)
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
            }
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

                Section("Events") {
                    if events.isEmpty {
                        Text("No events yet").foregroundStyle(.secondary)
                    }
                    ScrollView {
                        LazyVStack(alignment: .leading, spacing: 8) {
                            ForEach(Array(events.enumerated()), id: \.offset) { entry in
                                Text(entry.element)
                                    .font(.system(.caption, design: .monospaced))
                                    .frame(maxWidth: .infinity, alignment: .leading)
                            }
                        }
                    }
                    .frame(height: 240)
                }
            }
            .formStyle(.grouped)
            .frame(width: 280)
        }
    }
}

public enum PreviewApp {
    /// Executables launched with `swift run` have no app bundle to activate them.
    @MainActor
    public static func bringToFront() {
        NSApplication.shared.setActivationPolicy(.regular)
        NSApplication.shared.activate()
    }
}
