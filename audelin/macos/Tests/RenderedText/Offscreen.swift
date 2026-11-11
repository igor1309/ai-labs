import AppKit
import SwiftUI

/// Hosts a view in a window that is never shown: AppKit views draw there,
/// where `ImageRenderer` draws only a placeholder for them.
@MainActor
public enum Offscreen {

    /// The view at its own fitting size, or at `size` when given.
    public static func host<Content: View>(
        _ content: Content,
        size: CGSize? = nil,
        scheme: ColorScheme = .light
    ) -> NSHostingView<Content> {

        let host = NSHostingView(rootView: content)
        let window = TwoXWindow(
            contentRect: NSRect(origin: .zero, size: size ?? host.fittingSize),
            styleMask: .borderless,
            backing: .buffered,
            defer: false
        )
        window.appearance = NSAppearance(named: scheme == .dark ? .darkAqua : .aqua)
        window.contentView = host
        if size == nil { window.setContentSize(host.fittingSize) }
        host.layoutSubtreeIfNeeded()
        // Scrollers follow the machine's pointing device: a CI runner has no
        // trackpad and shows legacy ones. Draw the overlay style everywhere.
        overlayScrollers(in: host)
        host.layoutSubtreeIfNeeded()
        return host
    }

    private static func overlayScrollers(in view: NSView) {

        (view as? NSScrollView)?.scrollerStyle = .overlay
        view.subviews.forEach(overlayScrollers(in:))
    }

    public static func textView(in view: NSView) -> NSTextView? {

        if let text = view as? NSTextView { return text }
        return view.subviews.lazy.compactMap(textView(in:)).first
    }

    public static func heldText(in view: NSView) -> [NSTextField] {

        let own = (view as? NSTextField).flatMap { $0.accessibilityIdentifier() == "held-text" ? $0 : nil }
        return (own.map { [$0] } ?? []) + view.subviews.flatMap { heldText(in: $0) }
    }

    public static func snapshot(_ view: NSView) -> NSBitmapImageRep? {

        // Two pixels a point whatever the display: a CI runner's screen is 1x,
        // and a snapshot's size must not depend on the machine.
        view.display()
        let scale = 2
        guard let rep = NSBitmapImageRep(bitmapDataPlanes: nil, pixelsWide: Int(view.bounds.width) * scale,
                                         pixelsHigh: Int(view.bounds.height) * scale, bitsPerSample: 8, samplesPerPixel: 4,
                                         hasAlpha: true, isPlanar: false, colorSpaceName: .calibratedRGB,
                                         bytesPerRow: 0, bitsPerPixel: 0),
              // sRGB, not the display's profile, which differs between machines.
              let srgb = rep.retagging(with: .sRGB) else { return nil }
        srgb.size = view.bounds.size
        view.cacheDisplay(in: view.bounds, to: srgb)
        return srgb
    }

    /// Every text field in the view, whichever way SwiftUI hosts it.
    public static func textFields(in view: NSView) -> [NSTextField] {

        ((view as? NSTextField).map { [$0] } ?? []) + view.subviews.flatMap { textFields(in: $0) }
    }

    /// Writes the image only when `AUDELIN_SNAPSHOTS` names a folder, for
    /// comparing the panel with the design by eye.
    public static func save(_ image: NSBitmapImageRep, _ name: String) throws {

        guard let folder = ProcessInfo.processInfo.environment["AUDELIN_SNAPSHOTS"],
              let png = image.representation(using: .png, properties: [:])
        else { return }

        try png.write(to: URL(fileURLWithPath: folder).appendingPathComponent("\(name).png"))
    }
}

/// Lays views out for a 2x screen on any machine: a CI runner's screen is 1x,
/// and text snapped to its pixel grid draws differently.
private final class TwoXWindow: NSWindow {
    override var backingScaleFactor: CGFloat { 2 }
}
