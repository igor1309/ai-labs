import AppKit

@MainActor
protocol CallsWindowDriver: AnyObject {
    var title: String { get set }
    var isReleasedWhenClosed: Bool { get set }
    var minSize: NSSize { get set }
    var contentView: NSView? { get set }
    var isMiniaturized: Bool { get }
    func center()
    func deminiaturize(_ sender: Any?)
    func makeKeyAndOrderFront(_ sender: Any?)
}

extension NSWindow: CallsWindowDriver {}

/// Retains the same window after close; another menu action brings it forward.
@MainActor
final class CallsWindow {
    private let window: any CallsWindowDriver
    private let activate: () -> Void
    private let shown: (AnyObject) -> Void

    init(makeWindow: () -> any CallsWindowDriver, activate: @escaping () -> Void,
         shown: @escaping (AnyObject) -> Void = { _ in }) {
        window = makeWindow()
        self.activate = activate
        self.shown = shown
        window.title = "Звонки"
        window.isReleasedWhenClosed = false
        window.minSize = NSSize(width: 860, height: 360)
        window.center()
    }

    func install(content: NSView) { window.contentView = content }

    func show() {
        if window.isMiniaturized { window.deminiaturize(nil) }
        shown(window)
        activate()
        window.makeKeyAndOrderFront(nil)
    }
}
