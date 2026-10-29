#if os(macOS)
import AppKit
import DesignSystem
import SwiftUI

/// Run `swift run RenderAppIcon` from the app package to regenerate the asset.
@main @MainActor struct RenderAppIcon {
    static func main() throws {
        let icon = MizanSign()
            .fill(Tokens.host)
            .padding(200)
            .frame(width: 1024, height: 1024)
            .background(Tokens.ground)
            .environment(\.colorScheme, .dark)
        let renderer = ImageRenderer(content: icon)
        renderer.scale = 1
        renderer.isOpaque = true
        guard let image = renderer.cgImage,
              let png = NSBitmapImageRep(cgImage: image).representation(using: .png, properties: [:]) else {
            throw CocoaError(.fileWriteUnknown)
        }
        try png.write(to: URL(filePath: "MizanBLE/Assets.xcassets/AppIcon.appiconset/AppIcon.png"))
    }
}
#endif
