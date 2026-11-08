import AppKit
import MenuBar
import Testing

struct MenuBarUpdateTests {
    @Test func absentUpdatePreservesExistingEntriesAndBadgeFlag() {
        for recording in recordings {
            for badge in [false, true] {
                let original = MenuBarModel(recording: recording, preferences: .init(automatic: true, liveText: true))
                let menu = MenuBarModel(recording: recording, preferences: .init(automatic: true, liveText: true),
                                        updateBadge: badge, updateItem: .absent)
                #expect(menu.entries == original.entries)
                #expect(menu.updateBadge == badge)
                #expect(menu.item == original.item)
            }
        }
    }

    @Test func activeUpdateIsFirstWithSeparatorAndRestartAction() {
        for recording in recordings {
            let original = MenuBarModel(recording: recording, preferences: .init(automatic: false, liveText: true))
            let menu = MenuBarModel(recording: recording, preferences: .init(automatic: false, liveText: true),
                                    updateBadge: true, updateItem: .active)
            #expect(menu.entries == [.restart("Перезапустить для обновления", reason: nil), .separator] + original.entries)
            #expect(menu.updateBadge)
            #expect(menu.item == original.item)
        }
    }

    @Test func disabledUpdatePreservesReasonAndBadge() {
        for recording in recordings {
            let original = MenuBarModel(recording: recording, preferences: .init(automatic: false, liveText: true))
            let menu = MenuBarModel(recording: recording, preferences: .init(automatic: false, liveText: true),
                                    updateBadge: true, updateItem: .disabled("Доступно после звонка"))
            #expect(menu.entries == [.restart("Перезапустить для обновления", reason: "Доступно после звонка"), .separator] + original.entries)
            #expect(menu.updateBadge)
            #expect(menu.item == original.item)
        }
    }

    @MainActor @Test func badgePresentationLeavesTheStateGlyphUnchanged() {
        for recording in recordings {
            let item = MenuBarItem.from(recording, liveText: true)
            let expected = NSImage(systemSymbolName: item.symbol, accessibilityDescription: item.title)!
                .withSymbolConfiguration(.init(paletteColors: [item.isRed ? .systemRed : .labelColor]))!
            expected.isTemplate = !item.isRed
            let spy = BadgeSpy()
            for badge in [false, true, true, false] {
                let menu = MenuBarModel(recording: recording, preferences: .init(automatic: false, liveText: true),
                                        updateBadge: badge)
                menu.presentBadge(using: spy)
                let image = menu.item.image()
                #expect(image.isTemplate == !item.isRed)
                #expect(image.size == expected.size)
                #expect(image.alignmentRect == expected.alignmentRect)
                #expect(image.tiffRepresentation == expected.tiffRepresentation)
            }
            #expect(spy.calls == [false, true, true, false])
        }
    }
}

@MainActor
private final class BadgeSpy: MenuBarBadgePresenting {
    var calls: [Bool] = []
    func show() { calls.append(true) }
    func hide() { calls.append(false) }

    @MainActor @Test func recordingGlyphStaysRedWithTheBadge() {
        let menu = MenuBarModel(recording: .recording(call: true, faults: []),
                                preferences: .init(automatic: false, liveText: true), updateBadge: true)
        #expect(menu.item.isRed)
        #expect(!menu.item.image().isTemplate)
    }
}

private let recordings: [MenuBarRecording] = [
    .idle(automatic: false, unavailable: [], failure: nil),
    .recording(call: true, faults: []), .ending(faults: []),
]
