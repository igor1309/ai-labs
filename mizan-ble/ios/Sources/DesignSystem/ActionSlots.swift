import SwiftUI

/// A screen's actions, one per place in the footer. A place keeps its button
/// when the action in it changes, so "Lock & broadcast" turning into "Cancel"
/// changes that button's label and colour where it stands; only a place that
/// opens or closes brings its button in or out.
public struct ActionSlots<Item, Content: View>: View {

    let items: [Item]
    let content: (Item) -> Content

    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    public init(_ items: [Item], @ViewBuilder content: @escaping (Item) -> Content) {

        self.items = items
        self.content = content
    }

    /// An action keyed by its place, not by what it does.
    struct Slot: Identifiable {
        let id: Int
        let item: Item
    }

    var slots: [Slot] {

        items.enumerated().map { Slot(id: $0.offset, item: $0.element) }
    }

    public var body: some View {

        ForEach(slots) { slot in
            content(slot.item)
                .transition(Motion.itemTransition(reduced: reduceMotion, from: .bottom))
        }
    }
}
