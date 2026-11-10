import AppKit
import ApplicationServices

/// The live adapter: copies Zoom's Accessibility tree into `Node`s. Needs the Accessibility
/// permission; without it, or without Zoom, it returns no windows and naming stays off.
public struct ZoomWindows: Sendable {
    public static let bundleID = "us.zoom.xos"
    public let maxDepth: Int
    public init(maxDepth: Int = 12) { self.maxDepth = maxDepth }

    public var isPermitted: Bool { AXIsProcessTrusted() }

    /// Shows the system prompt; call only when the user turns naming on.
    public func requestPermission() {
        _ = AXIsProcessTrustedWithOptions(["AXTrustedCheckOptionPrompt": true] as CFDictionary)
    }

    public func windows() -> [Node] {
        guard isPermitted, let zoom = NSRunningApplication.runningApplications(withBundleIdentifier: Self.bundleID).first else { return [] }
        let app = AXUIElementCreateApplication(zoom.processIdentifier)
        return (attribute(app, kAXWindowsAttribute) as? [AXUIElement] ?? []).map { node($0, depth: 0) }
    }

    private func node(_ element: AXUIElement, depth: Int) -> Node {
        let children = depth < maxDepth ? (attribute(element, kAXChildrenAttribute) as? [AXUIElement] ?? []) : []
        return Node(
            role: attribute(element, kAXRoleAttribute) as? String ?? "",
            title: attribute(element, kAXTitleAttribute) as? String,
            identifier: attribute(element, kAXIdentifierAttribute) as? String,
            description: attribute(element, kAXDescriptionAttribute) as? String,
            value: attribute(element, kAXValueAttribute) as? String,
            children: children.map { node($0, depth: depth + 1) }
        )
    }

    private func attribute(_ element: AXUIElement, _ name: String) -> CFTypeRef? {
        var value: CFTypeRef?
        return AXUIElementCopyAttributeValue(element, name as CFString, &value) == .success ? value : nil
    }
}
