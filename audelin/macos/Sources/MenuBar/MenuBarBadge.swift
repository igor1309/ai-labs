import AppKit

@MainActor
public protocol MenuBarBadgePresenting {
    func show()
    func hide()
}

public extension MenuBarModel {
    @MainActor
    func presentBadge(using presenter: any MenuBarBadgePresenting) {
        if updateBadge { presenter.show() } else { presenter.hide() }
    }
}

@MainActor
public final class StatusButtonBadgePresenter: NSObject, MenuBarBadgePresenting {
    private let windows: () -> [NSWindow]
    private let matches: (NSStatusBarButton) -> Bool
    private let accent: (NSAppearance) -> NSColor
    private let notifications: NotificationCenter
    private var visible = false
    private weak var button: NSStatusBarButton?
    private var host: CALayer?
    private let dot = CAShapeLayer()
    private let cutout = CAShapeLayer()
    private var previousMask: CALayer?
    private var previousClipping = false

    public init(windows: @escaping () -> [NSWindow], matches: @escaping (NSStatusBarButton) -> Bool,
                accent: @escaping (NSAppearance) -> NSColor, notifications: NotificationCenter) {
        self.windows = windows
        self.matches = matches
        self.accent = accent
        self.notifications = notifications
        super.init()
        dot.name = "Audelin update badge"
        dot.zPosition = 1
        cutout.fillRule = .evenOdd
        cutout.fillColor = NSColor.black.cgColor
        notifications.addObserver(self, selector: #selector(refresh), name: NSApplication.didUpdateNotification, object: nil)
    }

    public func show() {
        visible = true
        refresh()
    }

    public func hide() {
        visible = false
        detach()
    }

    @objc private func refresh() {
        guard visible else { return }
        let found = windows().lazy.compactMap { $0.contentView }.compactMap { self.findButton(in: $0) }.first
        guard let found else { detach(); return }
        found.wantsLayer = true
        guard let layer = found.layer else { return }
        CATransaction.begin()
        CATransaction.setDisableActions(true)
        defer { CATransaction.commit() }
        if button !== found || host !== layer {
            detach()
            button = found
            host = layer
            previousMask = layer.mask
            previousClipping = layer.masksToBounds
            layer.masksToBounds = false
            layer.addSublayer(dot)
            layer.mask = cutout
        }
        let bounds = layer.bounds
        cutout.frame = bounds
        cutout.bounds = bounds
        let top = found.isFlipped ? bounds.minY : bounds.maxY
        let frame = CGRect(x: bounds.maxX - 4, y: top - 4, width: 8, height: 8)
        let colour = accent(found.effectiveAppearance).cgColor
        if dot.frame != frame {
            dot.frame = frame
            dot.path = CGPath(ellipseIn: dot.bounds, transform: nil)
        }
        if dot.fillColor != colour { dot.fillColor = colour }
        dot.contentsScale = found.window?.backingScaleFactor ?? 2
        // Mask the ring out of the entire button, including its glyph, so the
        // actual bar material shows through in either appearance.
        let path = CGMutablePath()
        path.addRect(bounds.union(frame.insetBy(dx: -1.5, dy: -1.5)))
        path.addEllipse(in: frame.insetBy(dx: -1.5, dy: -1.5))
        path.addEllipse(in: frame)
        if cutout.path != path { cutout.path = path }
    }

    private func findButton(in view: NSView) -> NSStatusBarButton? {
        if let button = view as? NSStatusBarButton, matches(button) { return button }
        for child in view.subviews {
            if let button = findButton(in: child) { return button }
        }
        return nil
    }

    private func detach() {
        dot.removeFromSuperlayer()
        if host?.mask === cutout { host?.mask = previousMask }
        host?.masksToBounds = previousClipping
        button = nil
        host = nil
        previousMask = nil
    }

    isolated deinit {
        notifications.removeObserver(self)
        detach()
    }
}
