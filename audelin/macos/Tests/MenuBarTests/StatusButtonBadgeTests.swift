import AppKit
import MenuBar
import Testing

@MainActor
struct StatusButtonBadgeTests {
    /// Contract test: a real AppKit status button retains its layout while its layer carries the badge.
    @Test func badgeStraddlesCornerWithoutChangingButtonOrImage() throws {
        let button = NSStatusBarButton(frame: NSRect(x: 3, y: 5, width: 28, height: 24))
        button.image = MenuBarItem.from(.idle(automatic: false, unavailable: [], failure: nil), liveText: true).image()
        let window = window(containing: button)
        let notifications = NotificationCenter()
        let presenter = StatusButtonBadgePresenter(windows: { [window] }, matches: { $0 === button },
                                                   accent: { _ in .systemTeal }, notifications: notifications)
        let originalFrame = button.frame
        let originalSize = button.intrinsicContentSize
        let originalImage = button.image
        let originalData = button.image?.tiffRepresentation
        button.wantsLayer = true
        let host = try #require(button.layer)
        let originalMask = CALayer()
        host.mask = originalMask
        host.masksToBounds = true
        for appearance in [NSAppearance.Name.aqua, .darkAqua] {
            button.appearance = NSAppearance(named: appearance)
            for _ in 0..<2 {
                presenter.show()
                let dot = try #require(host.sublayers?.first { $0.name == "Audelin update badge" } as? CAShapeLayer)
                let top = button.isFlipped ? button.bounds.minY : button.bounds.maxY
                #expect(dot.frame.minX < button.bounds.maxX)
                #expect(dot.frame.maxX > button.bounds.maxX)
                #expect(dot.frame.minY < top)
                #expect(dot.frame.maxY > top)
                #expect(dot.frame.size == CGSize(width: 8, height: 8))
                #expect(dot.fillColor == NSColor.systemTeal.cgColor)
                #expect(!host.masksToBounds)
                #expect(host.sublayers?.filter { $0 === dot }.count == 1)
                let mask = try #require(host.mask as? CAShapeLayer)
                let path = try #require(mask.path)
                #expect(mask.fillRule == .evenOdd)
                #expect(path.contains(CGPoint(x: dot.frame.midX, y: dot.frame.midY), using: .evenOdd))
                #expect(!path.contains(CGPoint(x: dot.frame.midX - 4.75, y: dot.frame.midY), using: .evenOdd))
                #expect(path.contains(CGPoint(x: button.bounds.midX, y: button.bounds.midY), using: .evenOdd))
                #expect(button.frame == originalFrame)
                #expect(button.intrinsicContentSize == originalSize)
                #expect(button.image === originalImage)
                #expect(button.image?.tiffRepresentation == originalData)
                presenter.hide()
                #expect(dot.superlayer == nil)
                #expect(host.mask === originalMask)
                #expect(host.masksToBounds)
                #expect(button.frame == originalFrame)
                #expect(button.intrinsicContentSize == originalSize)
            }
        }
    }

    /// Contract test: lookup walks public AppKit view trees and follows a replaced or resized button.
    @Test func lookupWaitsForMatchingButtonAndRefreshesItsCornerAndAppearance() throws {
        let unrelated = NSStatusBarButton(frame: NSRect(x: 0, y: 0, width: 26, height: 22))
        unrelated.setAccessibilityIdentifier("other")
        let otherWindow = window(containing: unrelated)
        let button = NSStatusBarButton(frame: unrelated.frame)
        button.setAccessibilityIdentifier("audelin.menu")
        let ourWindow = window(containing: button)
        var windows = [otherWindow]
        let notifications = NotificationCenter()
        let presenter = StatusButtonBadgePresenter(windows: { windows },
            matches: { $0.accessibilityIdentifier() == "audelin.menu" },
            accent: { $0.bestMatch(from: [.aqua, .darkAqua]) == .darkAqua ? .white : .black },
            notifications: notifications)
        presenter.show()
        #expect(unrelated.layer?.sublayers?.isEmpty ?? true)
        windows.append(ourWindow)
        notifications.post(name: NSApplication.didUpdateNotification, object: nil)
        let dot = try #require(button.layer?.sublayers?.first { $0.name == "Audelin update badge" })
        #expect(dot.superlayer === button.layer)
        button.setFrameSize(NSSize(width: 40, height: 28))
        button.appearance = NSAppearance(named: .darkAqua)
        notifications.post(name: NSApplication.didUpdateNotification, object: nil)
        #expect(dot.frame.midX == button.bounds.maxX)
        #expect(dot.frame.midY == (button.isFlipped ? button.bounds.minY : button.bounds.maxY))
        #expect((dot as? CAShapeLayer)?.fillColor == NSColor.white.cgColor)
        let replacement = NSStatusBarButton(frame: button.frame)
        replacement.setAccessibilityIdentifier("audelin.menu")
        let replacementWindow = window(containing: replacement)
        windows = [otherWindow, replacementWindow]
        notifications.post(name: NSApplication.didUpdateNotification, object: nil)
        #expect(button.layer?.mask == nil)
        #expect(dot.superlayer === replacement.layer)
        presenter.hide()
        notifications.post(name: NSApplication.didUpdateNotification, object: nil)
        #expect(dot.superlayer == nil)
        #expect(unrelated.layer?.sublayers?.isEmpty ?? true)
    }

    private func window(containing button: NSStatusBarButton) -> NSWindow {
        let window = NSWindow(contentRect: NSRect(x: 0, y: 0, width: 100, height: 100),
                              styleMask: [], backing: .buffered, defer: false)
        window.isReleasedWhenClosed = false
        let container = NSView(frame: window.contentView!.bounds)
        window.contentView!.addSubview(container)
        container.addSubview(button)
        return window
    }
}
