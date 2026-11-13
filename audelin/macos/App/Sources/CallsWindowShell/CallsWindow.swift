import AppKit

@MainActor
public protocol CallsWindowDriver: AnyObject {
    var title: String { get set }
    var isReleasedWhenClosed: Bool { get set }
    var minSize: NSSize { get set }
    var contentViewController: NSViewController? { get set }
    var isMiniaturized: Bool { get }
    func center()
    func setContentSize(_ size: NSSize)
    func setFrameUsingName(_ name: NSWindow.FrameAutosaveName) -> Bool
    @discardableResult func setFrameAutosaveName(_ name: NSWindow.FrameAutosaveName) -> Bool
    func deminiaturize(_ sender: Any?)
    func makeKeyAndOrderFront(_ sender: Any?)
}

extension NSWindow: CallsWindowDriver {}

/// Retains the same window after close; another menu action brings it forward.
/// Its position and size are saved under one autosave name and restored on launch;
/// a first launch opens wide enough to show a call beside the list.
@MainActor
public final class CallsWindow {
    private let window: any CallsWindowDriver
    private let activate: () -> Void
    private let shown: (AnyObject) -> Void

    public init(makeWindow: () -> any CallsWindowDriver, title: String, activate: @escaping () -> Void,
         shown: @escaping (AnyObject) -> Void = { _ in }) {
        window = makeWindow()
        self.activate = activate
        self.shown = shown
        window.title = title
        window.isReleasedWhenClosed = false
        window.minSize = NSSize(width: 560, height: 360)
    }

    public static let frameName = "CallsWindow"

    /// Installing content resizes the window to the content's fitting size, so
    /// the frame is set after it.
    public func install(controller: NSViewController) {
        window.contentViewController = controller
        if !window.setFrameUsingName(Self.frameName) {
            window.setContentSize(Self.firstSize)
            window.center()
        }
        window.setFrameAutosaveName(Self.frameName)
    }

    public static let firstSize = NSSize(width: 1000, height: 560)

    /// The title, as when the language changes.
    public func retitle(_ title: String) { window.title = title }

    public func show() {
        if window.isMiniaturized { window.deminiaturize(nil) }
        shown(window)
        activate()
        window.makeKeyAndOrderFront(nil)
    }
}
