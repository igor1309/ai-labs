import AppKit
import DesignSystem
import SwiftUI

@MainActor
public struct PreviewSnapshot<Content: View> {
    public let name: String
    public let content: (PreviewDeviceSize) -> Content

    public init(_ name: String, @ViewBuilder content: @escaping (PreviewDeviceSize) -> Content) {
        self.name = name
        self.content = content
    }
}

public enum PreviewExporter {
    /// Each state is rendered without window chrome, at one pixel per point.
    @MainActor
    public static func export<Content: View>(
        _ snapshots: [PreviewSnapshot<Content>], to folder: URL,
        devices: [PreviewDeviceSize] = PreviewDeviceSize.allCases
    ) throws {
        try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
        for snapshot in snapshots {
            for device in devices {
                for scheme in [ColorScheme.light, .dark] {
                    let appearance = scheme == .light ? "light" : "dark"
                    let name = "\(snapshot.name)-\(device.rawValue)-\(appearance).png"
                    let size = device.size
                    let renderer = ImageRenderer(content: snapshot.content(device)
                        .deviceScreen(size, cornerRadius: device.cornerRadius, safeArea: device.safeArea)
                        .environment(\.horizontalSizeClass, device == .iPhone ? .compact : .regular)
                        .environment(\.colorScheme, scheme))
                    renderer.proposedSize = ProposedViewSize(size)
                    renderer.scale = 1
                    guard let image = renderer.cgImage,
                          let png = NSBitmapImageRep(cgImage: image).representation(using: .png, properties: [:])
                    else { throw ExportError.cannotRender(name) }
                    try png.write(to: folder.appendingPathComponent(name), options: .atomic)
                }
            }
        }
    }

    private enum ExportError: Error {
        case cannotRender(String)
    }
}
