import AppKit
import SwiftUI
import Testing
@testable import PanelUI
import RenderedText

@MainActor
struct PanelViewRenderTests {

    @Test(arguments: [ColorScheme.light, .dark])
    func rendersSelectionWhileDragging(scheme: ColorScheme) throws {

        let host = Offscreen.host(PanelPreview(state: .recording, scheme: scheme), scheme: scheme)
        let text = try #require(Offscreen.textView(in: host) as? LogTextView)
        // The live panel cannot become key, even during a drag.
        #expect(host.window?.isKeyWindow == false)
        let range = (text.string as NSString).range(of: "Accountable — я. По слог отвечает команда Ильи.")
        text.selectionStarted?()
        text.setSelectedRange(range, affinity: .downstream, stillSelecting: true)
        let image = try #require(Offscreen.snapshot(host))
        #expect(text.selectedRange() == range)
        let layout = try #require(text.textLayoutManager)
        let content = try #require(layout.textContentManager)
        let start = try #require(content.location(content.documentRange.location, offsetBy: range.location))
        let end = try #require(content.location(start, offsetBy: range.length))
        let selected = try #require(NSTextRange(location: start, end: end))
        var frames: [CGRect] = []
        layout.enumerateTextSegments(in: selected, type: .selection, options: []) { _, rect, _, _ in
            frames.append(rect.offsetBy(dx: text.textContainerOrigin.x, dy: text.textContainerOrigin.y))
            return true
        }
        let firstLine = try #require(frames.first)
        let selectedImage = try #require(Offscreen.snapshot(text))
        let scale = CGFloat(selectedImage.pixelsWide) / text.bounds.width
        let pixels = firstLine.insetBy(dx: 1, dy: 1)
        var luminances: [Double] = []
        for y in Int(pixels.minY * scale)..<Int(pixels.maxY * scale) {
            for x in Int(pixels.minX * scale)..<Int(pixels.maxX * scale) {
                let color = try #require(selectedImage.colorAt(x: x, y: y)?.usingColorSpace(.sRGB))
                func linear(_ value: CGFloat) -> Double {
                    value <= 0.04045 ? Double(value / 12.92) : pow(Double((value + 0.055) / 1.055), 2.4)
                }
                luminances.append(0.2126 * linear(color.redComponent) + 0.7152 * linear(color.greenComponent) + 0.0722 * linear(color.blueComponent))
            }
        }
        let darkest = try #require(luminances.min())
        let lightest = try #require(luminances.max())
        #expect((lightest + 0.05) / (darkest + 0.05) >= 4.5, "Selected glyphs must contrast with their rendered background")
        try Offscreen.save(image, "drag-selection-\(scheme == .dark ? "dark" : "light")")
    }

    @Test(arguments: [ColorScheme.light, .dark])
    func longHoldWrapsWithoutPushingOutThePanel(scheme: ColorScheme) throws {

        let host = Offscreen.host(PanelPreview(state: .longSelectionHeld, scheme: scheme), scheme: scheme)
        let labels = Offscreen.heldText(in: host)
        #expect(labels.count == 2)
        let short = try #require(labels.first)
        let long = try #require(labels.last)
        #expect(long.frame.height > short.frame.height)
        #expect(long.frame.height <= short.frame.height * 3 + 2)
        #expect(long.toolTip == long.stringValue)
        #expect(long.cell?.truncatesLastVisibleLine == true)
        #expect(long.font?.fontDescriptor.symbolicTraits.contains(.bold) == false)
        #expect(long.accessibilityLabel() == long.stringValue)
        #expect(long.frame.width == short.frame.width)
    }

    @Test(arguments: [ColorScheme.light, .dark], [PanelState.oneRemoteSpeaker, .twoRemoteSpeakers, .severalRemoteSpeakers])
    func eachRemoteSpeakerIsDrawnInItsOwnColour(scheme: ColorScheme, state: PanelState) throws {

        let tokens = PanelConfig.glassLedger.tokens(for: scheme)
        let host = Offscreen.host(PanelPreview(state: state, scheme: scheme), scheme: scheme)
        let text = try #require(Offscreen.textView(in: host)?.textStorage)
        let string = text.string as NSString
        func colour(of substring: String) throws -> NSColor? {
            let range = string.range(of: substring)
            try #require(range.location != NSNotFound, "«\(substring)» is not shown")
            return (text.attribute(.foregroundColor, at: range.location, effectiveRange: nil) as? NSColor)?.usingColorSpace(.sRGB)
        }
        for entry in state.shownEntries {
            let expected = NSColor(entry.speaker == .me ? tokens.me : tokens.remoteSpeaker(entry.remoteSpeaker)).usingColorSpace(.sRGB)
            #expect(try colour(of: "\t" + entry.time + "\t") == expected, "\(entry.time)")
            if let label = entry.label {
                #expect(try colour(of: "\t" + label) == expected, "\(label)")
            }
        }
    }

    @Test(arguments: [ColorScheme.light, .dark], PanelLanguage.allCases)
    func rendersEveryPreviewState(scheme: ColorScheme, language: PanelLanguage) throws {

        let panelText = PanelText(language: language)

        let holds = [PanelState.Held(entryID: 3, text: "Первый фрагмент"), .init(entryID: 4, text: "Second selection")]
        let preparing = (0...holds.count).map { count in
            (name: "preparing-\(count)-holds", state: PanelState(recording: .on(elapsed: "00:00:12"), log: .preparing(holds: Array(holds.prefix(count)))))
        }
        for (name, state) in PanelState.previews(in: panelText) + preparing {

            let host = Offscreen.host(PanelPreview(state: state, scheme: scheme, text: panelText), scheme: scheme)
            let image = try #require(Offscreen.snapshot(host), "\(name) did not render")
            #expect(CGFloat(image.pixelsWide) > PanelConfig.glassLedger.panelWidth, "\(name)")

            for entry in state.shownEntries where !entry.settled.isEmpty {
                let text = Offscreen.textView(in: host)?.string ?? ""
                #expect(text.contains(entry.settled), "\(name) does not show «\(entry.settled)»")
            }

            let expectedHolds: [PanelState.Held] = switch state.log {
            case let .preparing(holds): holds
            case let .lines(lines): lines.holds
            case let .liveTextOff(kept): kept?.holds ?? []
            case .empty: []
            }
            let labels = Offscreen.heldText(in: host)
            #expect(labels.map(\.stringValue) == expectedHolds.map(\.text), "\(name)")
            #expect(labels.map { $0.accessibilityLabel() } == expectedHolds.map(\.text), "\(name)")
            let window = try #require(host.window)
            let visible = window.convertToScreen(host.convert(host.visibleRect, to: nil))
            for label in labels {
                let frame = label.accessibilityFrame()
                #expect(!label.isHiddenOrHasHiddenAncestor)
                #expect(!frame.isEmpty && visible.contains(frame), "\(name) held text is not visible")
            }

            let suffix = language == .russian ? "" : "-\(language.rawValue)"
            try Offscreen.save(image, "\(name)-\(scheme == .dark ? "dark" : "light")\(suffix)")
        }
    }
}

private extension PanelState {

    var shownEntries: [Entry] {

        switch log {
        case .empty, .preparing, .liveTextOff(kept: nil): []
        case let .liveTextOff(kept: lines?), let .lines(lines): lines.entries
        }
    }
}
