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

    @MainActor @Test func badgeKeepsImageGeometryAndColour() {
        for recording in recordings {
            let item = MenuBarItem.from(recording, liveText: true)
            let plain = item.image(updateBadge: false, accent: .systemTeal)
            let badged = item.image(updateBadge: true, accent: .systemTeal)
            #expect(badged.size == plain.size)
            #expect(badged.alignmentRect == plain.alignmentRect)
            #expect(plain.isTemplate == !item.isRed)
            #expect(!badged.isTemplate)
            #expect(badged.tiffRepresentation != plain.tiffRepresentation)
        }
    }
}

private let recordings: [MenuBarRecording] = [
    .idle(automatic: false, unavailable: [], failure: nil),
    .recording(call: true, faults: []), .ending(faults: []),
]
