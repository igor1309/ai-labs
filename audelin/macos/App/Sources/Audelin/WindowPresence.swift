import AppKit

/// Shows Audelin in the Dock and the app switcher while one of its ordinary
/// windows (Settings, Calls) is open, like a regular Mac app; with every
/// such window closed the app is again only its menu bar item (LAB-1150).
@MainActor
final class WindowPresence {
    private let setPolicy: (NSApplication.ActivationPolicy) -> Void
    private var open: Set<ObjectIdentifier> = []

    init(setPolicy: @escaping (NSApplication.ActivationPolicy) -> Void) {
        self.setPolicy = setPolicy
    }

    func shown(_ window: AnyObject) {
        let wasEmpty = open.isEmpty
        open.insert(ObjectIdentifier(window))
        if wasEmpty { setPolicy(.regular) }
    }

    func closed(_ window: AnyObject) {
        guard open.remove(ObjectIdentifier(window)) != nil, open.isEmpty else { return }
        setPolicy(.accessory)
    }

    /// Follows the window's own close, whether by its button, ⌘W or the menu.
    func track(_ window: NSWindow) {
        NotificationCenter.default.addObserver(forName: NSWindow.willCloseNotification, object: window, queue: .main) {
            [weak self, weak window] _ in
            MainActor.assumeIsolated { if let self, let window { self.closed(window) } }
        }
    }
}
